import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import mpegts from "mpegts.js";
import { createLogger } from "../services/logger";
import type { AudioStreamInfo, ContentType, EmbeddedSubtitleTrack, SubtitleTrack } from "../types";

interface PlayerSubtitleTrack extends SubtitleTrack {
	renderSrc: string;
	normalizedVtt?: string;
	renderOffset: number;
	ownsRenderSrc: boolean;
	windowStart?: number;
	windowEnd?: number;
}

export interface SubtitleOption {
	id: string;
	label: string;
	language: string;
	source: "external" | "embedded";
	// Image-based embedded track that will be burned into the video on selection.
	bitmap?: boolean;
}

// Matches a cue timing line in either "HH:MM:SS.mmm" or "MM:SS.mmm" form
// (SubRip uses a comma before the milliseconds, WebVTT a dot).
const CUE_TIMING = /^((?:\d{1,2}:)?\d{1,2}:\d{2}[.,]\d{3})\s*-->\s*((?:\d{1,2}:)?\d{1,2}:\d{2}[.,]\d{3})(.*)$/;

// Lift cues off the very bottom so they clear the control bar (84% from the top).
const SUBTITLE_LINE = "line:84%";
const EMBEDDED_SUBTITLE_WINDOW_SECONDS = 90;
const EMBEDDED_SUBTITLE_LOOKAHEAD_SECONDS = 25;
const EMBEDDED_SUBTITLE_BACKTRACK_SECONDS = 5;
const logger = createLogger("video-player");

function parseCueTime(value: string): number {
	const parts = value.replace(",", ".").split(":").map(Number);
	if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
	if (parts.length === 2) return parts[0] * 60 + parts[1];
	return Number.NaN;
}

function formatCueTime(value: number): string {
	const totalMilliseconds = Math.max(0, Math.round(value * 1000));
	const hours = Math.floor(totalMilliseconds / 3_600_000);
	const minutes = Math.floor((totalMilliseconds % 3_600_000) / 60_000);
	const seconds = Math.floor((totalMilliseconds % 60_000) / 1000);
	const milliseconds = totalMilliseconds % 1000;

	return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(milliseconds).padStart(3, "0")}`;
}

function isAbortError(error: unknown): boolean {
	return error instanceof DOMException && error.name === "AbortError";
}

function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/**
 * Normalize SubRip or WebVTT text into a clean WebVTT document and nudge every
 * cue upward so subtitles aren't glued to the bottom edge of the video.
 */
function normalizeVtt(raw: string): string {
	const text = raw
		.replace(/^\uFEFF/, "")
		.replace(/\r\n/g, "\n")
		.replace(/\r/g, "\n")
		.replace(/^\s*WEBVTT[^\n]*\n?/i, "");

	const body = text
		.split("\n")
		.map((line) => {
			const match = line.match(CUE_TIMING);
			if (!match) return line;

			const start = match[1].replace(",", ".");
			const end = match[2].replace(",", ".");
			const settings = match[3];

			// Respect cues that already carry positioning info.
			if (/\b(?:line|position):/.test(settings)) {
				return `${start} --> ${end}${settings}`;
			}
			return `${start} --> ${end}${settings} ${SUBTITLE_LINE}`;
		})
		.join("\n");

	return `WEBVTT\n\n${body.trim()}\n`;
}

function shiftVtt(normalizedVtt: string, offsetSeconds: number): string {
	const offset = Math.max(0, offsetSeconds);
	if (offset <= 0) return normalizedVtt;

	const lines = normalizedVtt
		.replace(/\r\n/g, "\n")
		.replace(/\r/g, "\n")
		.split("\n");
	const header: string[] = [];
	const bodyLines = [...lines];

	while (bodyLines.length > 0) {
		const line = bodyLines.shift() ?? "";
		header.push(line);
		if (line.trim() === "") break;
	}

	const body = bodyLines.join("\n");
	const shiftedBlocks = body
		.split(/\n{2,}/)
		.map((block) => {
			const blockLines = block.split("\n");
			const timingIndex = blockLines.findIndex((line) => CUE_TIMING.test(line));
			if (timingIndex === -1) return block;

			const match = blockLines[timingIndex].match(CUE_TIMING);
			if (!match) return block;

			const start = parseCueTime(match[1]);
			const end = parseCueTime(match[2]);
			if (!Number.isFinite(start) || !Number.isFinite(end)) return block;
			if (end <= offset) return "";

			const shiftedStart = Math.max(0, start - offset);
			const shiftedEnd = Math.max(shiftedStart + 0.001, end - offset);
			blockLines[timingIndex] = `${formatCueTime(shiftedStart)} --> ${formatCueTime(shiftedEnd)}${match[3]}`;
			return blockLines.join("\n");
		})
		.filter((block) => block.trim().length > 0);

	return `WEBVTT\n\n${shiftedBlocks.join("\n\n")}\n`;
}

function createSubtitleRenderSrc(normalizedVtt: string, offsetSeconds: number): string {
	return URL.createObjectURL(new Blob([shiftVtt(normalizedVtt, offsetSeconds)], { type: "text/vtt" }));
}

function revokeSubtitleRenderSrc(track: PlayerSubtitleTrack): void {
	if (track.ownsRenderSrc && track.renderSrc.startsWith("blob:")) {
		URL.revokeObjectURL(track.renderSrc);
	}
}

/**
 * Always fetch the subtitle and re-serve it as a same-origin blob.
 * This converts SRT to VTT and, crucially, sidesteps cross-origin <track>
 * loading failures (Chromium refuses remote VTT tracks without CORS headers).
 */
async function prepareSubtitleTrack(
	track: SubtitleTrack,
	signal: AbortSignal,
	renderOffset: number
): Promise<PlayerSubtitleTrack> {
	try {
		const response = await fetch(track.src, { signal });
		if (!response.ok) throw new Error(`HTTP ${response.status}`);

		const text = await response.text();
		const normalizedVtt = normalizeVtt(text);
		return {
			...track,
			normalizedVtt,
			renderSrc: createSubtitleRenderSrc(normalizedVtt, renderOffset),
			renderOffset,
			ownsRenderSrc: true
		};
	} catch (error) {
		if (!isAbortError(error)) {
			logger.warn("Subtitle preparation failed; falling back to remote track", {
				error: getErrorMessage(error),
				label: track.label,
				language: track.language,
				src: track.src,
				trackId: track.id
			});
		}

		// Network/abort fallback: hand the raw URL to the <track> and hope for the best.
		return { ...track, renderSrc: track.src, renderOffset, ownsRenderSrc: false };
	}
}

function buildSeekableTranscodeUrl(
	url: string,
	startTime: number,
	audioIndex = 0,
	burnSubtitleIndex: number | null = null
): string {
	const nextUrl = new URL(url);
	nextUrl.searchParams.set("start", Math.max(0, startTime).toFixed(3));
	nextUrl.searchParams.set("audio", String(audioIndex));
	if (burnSubtitleIndex !== null && burnSubtitleIndex >= 0) {
		nextUrl.searchParams.set("subtitle", String(burnSubtitleIndex));
	} else {
		nextUrl.searchParams.delete("subtitle");
	}
	return nextUrl.toString();
}

function getExternalSubtitleId(track: SubtitleTrack): string {
	return track.id || track.src;
}

export function useVideoPlayer(
	videoRef: RefObject<HTMLVideoElement | null>,
	streamUrl: string | null,
	type: ContentType,
	subtitles: SubtitleTrack[] = []
) {
	const [audioTracks, setAudioTracks] = useState<AudioTrack[]>([]);
	const [probeAudioTracks, setProbeAudioTracks] = useState<AudioStreamInfo[]>([]);
	const [selectedAudioIndex, setSelectedAudioIndex] = useState(0);
	const [selectedTranscodeAudioIndex, setSelectedTranscodeAudioIndex] = useState(0);
	const [subtitleTracks, setSubtitleTracks] = useState<PlayerSubtitleTrack[]>([]);
	const [embeddedSubtitleTracks, setEmbeddedSubtitleTracks] = useState<EmbeddedSubtitleTrack[]>([]);
	const [selectedSubtitleId, setSelectedSubtitleId] = useState<string>("off");
	const [subtitleLoadingId, setSubtitleLoadingId] = useState<string | null>(null);
	const [subtitleError, setSubtitleError] = useState<string | null>(null);
	const [playableStreamUrl, setPlayableStreamUrl] = useState<string | null>(null);
	const [resolvedStreamUrl, setResolvedStreamUrl] = useState<string | null>(null);
	// Transcode base URL kept around even for natively-played streams, so a
	// bitmap subtitle can be burned in on demand by switching to a re-encode.
	const [transcodeBaseUrl, setTranscodeBaseUrl] = useState<string | null>(null);
	// Subtitle-relative index (ffmpeg 0:s:N) currently burned into the picture,
	// or null when no bitmap subtitle is active.
	const [burnSubtitleIndex, setBurnSubtitleIndex] = useState<number | null>(null);
	const [durationOverride, setDurationOverride] = useState<number | null>(null);
	const [isTranscodedStream, setIsTranscodedStream] = useState(false);
	const [streamOffset, setStreamOffset] = useState(0);
	const [currentTime, setCurrentTime] = useState(0);
	const [duration, setDuration] = useState(0);
	const [isPaused, setIsPaused] = useState(true);
	const [isMuted, setIsMuted] = useState(false);
	const [volume, setVolumeState] = useState(1);
	const [playbackRate, setPlaybackRateState] = useState(1);
	const [isBuffering, setIsBuffering] = useState(false);
	const [isFullscreen, setIsFullscreen] = useState(false);
	const [requiresMpegTsPlayer, setRequiresMpegTsPlayer] = useState(false);

	// Ref-tracked currentTime so the keyboard seek handler doesn't re-register on every tick.
	const currentTimeRef = useRef(0);
	const streamProxyIdRef = useRef<string | null>(null);
	const subtitleRenderOffset = isTranscodedStream ? streamOffset : 0;
	const subtitleRenderOffsetRef = useRef(0);
	const subtitleTracksRef = useRef<PlayerSubtitleTrack[]>([]);
	const selectedSubtitleIdRef = useRef("off");
	const subtitleLoadControllerRef = useRef<AbortController | null>(null);
	const embeddedWindowLoadRef = useRef<{ id: string; start: number } | null>(null);
	const lastLocalTimeRef = useRef(0);
	const lastTranscodeRestartAtRef = useRef(0);
	// Stall-watchdog memory. Kept in refs (not effect-local vars) so it survives
	// the playback effect re-running on every transcode rebuild — otherwise the
	// attempt cap would reset each rebuild and a slow stream would loop forever.
	const stallProgressRef = useRef({ pos: -1, at: 0 });
	const stallEverProgressedRef = useRef(false);
	const stallLastNudgeAtRef = useRef(0);
	const stallRecoverAttemptsRef = useRef(0);
	const transcodePlayerRef = useRef<mpegts.Player | null>(null);
	const playbackRateRef = useRef(1);
	const transcodeBaseUrlRef = useRef<string | null>(null);
	const resolvedStreamUrlRef = useRef<string | null>(null);
	const selectedTranscodeAudioIndexRef = useRef(0);
	const burnSubtitleIndexRef = useRef<number | null>(null);

	const releaseCurrentStreamProxy = useCallback(() => {
		const proxyId = streamProxyIdRef.current;
		if (!proxyId) return;

		streamProxyIdRef.current = null;
		void window.openIptv?.releaseStreamProxy?.(proxyId);
	}, []);

	const createPlaybackProxy = useCallback(async (url: string): Promise<{ url: string; proxyId: string | null }> => {
		if (!window.openIptv?.createStreamProxy) {
			return { url, proxyId: null };
		}

		const result = await window.openIptv.createStreamProxy(url);
		if (!result.ok || !result.url || !result.id) {
			return { url, proxyId: null };
		}

		return { url: result.url, proxyId: result.id };
	}, []);

	const subtitleSignature = useMemo(
		() => subtitles.map((track) => `${track.language}:${track.src}`).join("|"),
		[subtitles]
	);

	const subtitleOptions = useMemo<SubtitleOption[]>(() => {
		const external: SubtitleOption[] = subtitles.map((track, index) => ({
			id: getExternalSubtitleId(track),
			label: track.label || `Subtitle ${index + 1}`,
			language: track.language || "und",
			source: "external"
		}));

		const embedded: SubtitleOption[] = embeddedSubtitleTracks
			.map((track) => ({
				id: track.id,
				label: `${track.label}${track.codec ? ` (${track.codec})` : ""}`,
				language: track.language,
				source: "embedded" as const,
				bitmap: track.bitmap
			}));

		return [...external, ...embedded];
	}, [embeddedSubtitleTracks, subtitles]);

	useEffect(() => {
		subtitleRenderOffsetRef.current = subtitleRenderOffset;
	}, [subtitleRenderOffset]);

	useEffect(() => {
		selectedSubtitleIdRef.current = selectedSubtitleId;
	}, [selectedSubtitleId]);

	useEffect(() => {
		subtitleTracksRef.current = subtitleTracks;
	}, [subtitleTracks]);

	useEffect(() => {
		transcodeBaseUrlRef.current = transcodeBaseUrl;
	}, [transcodeBaseUrl]);

	useEffect(() => {
		resolvedStreamUrlRef.current = resolvedStreamUrl;
	}, [resolvedStreamUrl]);

	useEffect(() => {
		selectedTranscodeAudioIndexRef.current = selectedTranscodeAudioIndex;
	}, [selectedTranscodeAudioIndex]);

	useEffect(() => {
		burnSubtitleIndexRef.current = burnSubtitleIndex;
	}, [burnSubtitleIndex]);

	useEffect(() => {
		playbackRateRef.current = playbackRate;
		const video = videoRef.current;
		if (!video) return;
		video.playbackRate = playbackRate;
	}, [playbackRate, videoRef]);

	useEffect(() => {
		setSubtitleTracks((tracks) => {
			if (selectedSubtitleId === "off") return tracks;

			let changed = false;
			const nextTracks = tracks.map((track) => {
				if (
					track.id !== selectedSubtitleId
					|| !track.normalizedVtt
					|| track.renderOffset === subtitleRenderOffset
				) {
					return track;
				}

				revokeSubtitleRenderSrc(track);
				changed = true;
				return {
					...track,
					renderSrc: createSubtitleRenderSrc(track.normalizedVtt, subtitleRenderOffset),
					renderOffset: subtitleRenderOffset,
					ownsRenderSrc: true
				};
			});

			return changed ? nextTracks : tracks;
		});
	}, [selectedSubtitleId, subtitleRenderOffset]);

	// Keep the player native, but swap AC3/E-AC3 VOD audio to a local AAC stream when needed.
	useEffect(() => {
		let cancelled = false;

		releaseCurrentStreamProxy();

		if (!streamUrl) {
			setPlayableStreamUrl(null);
			setResolvedStreamUrl(null);
			setTranscodeBaseUrl(null);
			setBurnSubtitleIndex(null);
			setDurationOverride(null);
			setIsTranscodedStream(false);
			setRequiresMpegTsPlayer(false);
			setStreamOffset(0);
			setCurrentTime(0);
			setProbeAudioTracks([]);
			setSelectedTranscodeAudioIndex(0);
			return;
		}

		if (type !== "vod" || !window.openIptv?.resolvePlayableStream) {
			const useDirectPlayback = async () => {
				const playback = await createPlaybackProxy(streamUrl);
				if (cancelled) {
					if (playback.proxyId) void window.openIptv?.releaseStreamProxy?.(playback.proxyId);
					return;
				}

				streamProxyIdRef.current = playback.proxyId;
				setPlayableStreamUrl(playback.url);
				setResolvedStreamUrl(playback.url);
				setTranscodeBaseUrl(null);
				setBurnSubtitleIndex(null);
				setDurationOverride(null);
				setIsTranscodedStream(false);
				setStreamOffset(0);
				setCurrentTime(0);
				setProbeAudioTracks([]);
				setSelectedTranscodeAudioIndex(0);
			};

			void useDirectPlayback();
			return () => {
				cancelled = true;
				releaseCurrentStreamProxy();
			};
		}

		setPlayableStreamUrl(null);
		setResolvedStreamUrl(null);
		setTranscodeBaseUrl(null);
		setBurnSubtitleIndex(null);
		setDurationOverride(null);
		setIsTranscodedStream(false);
		setRequiresMpegTsPlayer(false);
		setStreamOffset(0);
		setCurrentTime(0);
		setProbeAudioTracks([]);
		setSelectedTranscodeAudioIndex(0);
		setIsBuffering(true);

		const resolvePlayableUrl = async () => {
			try {
				const result = await window.openIptv?.resolvePlayableStream(streamUrl);

				const tracks = result?.audioTracks ?? [];
				const defaultAudioIdx = result?.defaultAudioIndex ?? 0;

				const nextUrl = result?.ok && result.url ? result.url : streamUrl;
				const shouldUseTranscodeSeek = Boolean(result?.ok && result.transcoded);
				const playback = shouldUseTranscodeSeek
					? { url: nextUrl, proxyId: null }
					: await createPlaybackProxy(nextUrl);

				if (cancelled) {
					if (playback.proxyId) void window.openIptv?.releaseStreamProxy?.(playback.proxyId);
					return;
				}

				streamProxyIdRef.current = playback.proxyId;
				setProbeAudioTracks(tracks);
				setSelectedTranscodeAudioIndex(defaultAudioIdx);
				if (defaultAudioIdx !== 0) setSelectedAudioIndex(defaultAudioIdx);
				setResolvedStreamUrl(nextUrl);
				setTranscodeBaseUrl(result?.transcodeBaseUrl ?? null);
				setBurnSubtitleIndex(null);
				setIsTranscodedStream(shouldUseTranscodeSeek);
				setRequiresMpegTsPlayer(!shouldUseTranscodeSeek && (result?.requiresMpegTsPlayer ?? false));
				setPlayableStreamUrl(
					shouldUseTranscodeSeek
						? buildSeekableTranscodeUrl(playback.url, 0, defaultAudioIdx)
						: playback.url
				);
				setDurationOverride(
					result?.durationSeconds && result.durationSeconds > 0 ? result.durationSeconds : null
				);
			} catch (error) {
				if (!cancelled) {
					logger.exception("Failed to resolve playable VOD stream; using original URL", error, {
						streamUrl
					});
					const playback = await createPlaybackProxy(streamUrl);
					if (cancelled) {
						if (playback.proxyId) void window.openIptv?.releaseStreamProxy?.(playback.proxyId);
						return;
					}
					streamProxyIdRef.current = playback.proxyId;
					setPlayableStreamUrl(playback.url);
					setResolvedStreamUrl(playback.url);
					setTranscodeBaseUrl(null);
					setBurnSubtitleIndex(null);
					setDurationOverride(null);
					setIsTranscodedStream(false);
					setRequiresMpegTsPlayer(false);
				}
			} finally {
				if (!cancelled) setIsBuffering(false);
			}
		};

		void resolvePlayableUrl();

		return () => {
			cancelled = true;
			releaseCurrentStreamProxy();
			// Proactively stop any server-side transcode for the stream we're
			// leaving, so ffmpeg doesn't linger when backing out to the menu.
			void window.openIptv?.stopTranscoding?.();
		};
	}, [createPlaybackProxy, releaseCurrentStreamProxy, streamUrl, type]);

	// Reset the stall watchdog's memory when the media itself changes — but not on
	// a transcode rebuild, which keeps the same streamUrl. Carrying the attempt
	// cap or "ever progressed" flag into the next title would misfire the watchdog.
	useEffect(() => {
		stallProgressRef.current = { pos: -1, at: 0 };
		stallEverProgressedRef.current = false;
		stallLastNudgeAtRef.current = 0;
		stallRecoverAttemptsRef.current = 0;
	}, [streamUrl]);

	// Attach the video source and wire up playback events (VOD only).
	useEffect(() => {
		const video = videoRef.current;
		if (!video || type !== "vod" || !playableStreamUrl) return;

		video.volume = volume;
		lastLocalTimeRef.current = 0;
		transcodePlayerRef.current?.destroy();
		transcodePlayerRef.current = null;

		if ((isTranscodedStream || requiresMpegTsPlayer) && mpegts.isSupported()) {
			const player = mpegts.createPlayer({
				type: "mpegts",
				isLive: false,
				url: playableStreamUrl
			}, {
				enableWorker: true,
				// Keep pulling from the local ffmpeg pipe continuously instead of
				// suspending the connection when the buffer looks "full" — we want
				// to build the deepest lead the transcoder can give us.
				lazyLoad: false,
				// Hold a smaller initial stash to reduce the Time-To-First-Byte (TTFB) 
				// and start playback almost instantly, while keeping stashBuffer enabled
				// to prevent stuttering later. 128KB instead of 1MB.
				enableStashBuffer: true,
				stashInitialSize: 128 * 1024,
				// Fix audio timestamp gaps which are common in IPTV streams and cause freezing.
				fixAudioTimestampGap: true,
				deferLoadAfterSourceOpen: false,
				// Trim already-played media so a long movie's SourceBuffer can't grow
				// unbounded and cause GC hitches mid-playback, while keeping a roomy
				// backward window so short rewinds stay instant.
				autoCleanupSourceBuffer: true,
				autoCleanupMaxBackwardDuration: 120,
				autoCleanupMinBackwardDuration: 90,
				reuseRedirectedURL: true
			});

			transcodePlayerRef.current = player;
			player.attachMediaElement(video);
			player.load();
			void player.play();
		} else {
			video.src = playableStreamUrl;
			void video.play();
		}

		const getStableDuration = () => {
			if (durationOverride && durationOverride > 0) return durationOverride;
			return Number.isFinite(video.duration) ? video.duration : 0;
		};

		const syncAudioTracks = () => {
			const tracks = video.audioTracks;
			if (!tracks) return;

			const tracksArray = Array.from(tracks);
			setAudioTracks(tracksArray);
			const activeIndex = tracksArray.findIndex((track) => track.enabled);
			setSelectedAudioIndex(activeIndex !== -1 ? activeIndex : 0);
		};

		const syncVolume = () => {
			setVolumeState(video.volume);
			setIsMuted(video.muted);
		};

		const syncFullscreen = () => {
			setIsFullscreen(Boolean(document.fullscreenElement));
		};

		const handleLoadedMetadata = () => {
			setDuration(getStableDuration());
			syncAudioTracks();
		};

		const handleDurationChange = () => {
			setDuration(getStableDuration());
		};
		const handleTimeUpdate = () => {
			const stableDuration = getStableDuration();
			if (
				isTranscodedStream
				&& resolvedStreamUrl
				&& Date.now() - lastTranscodeRestartAtRef.current > 3000
				&& lastLocalTimeRef.current > 20
				&& video.currentTime < 2
			) {
				const resumeTime = streamOffset + lastLocalTimeRef.current;
				setStreamOffset(resumeTime);
				setCurrentTime(resumeTime);
				currentTimeRef.current = resumeTime;
				setIsBuffering(true);
				lastTranscodeRestartAtRef.current = Date.now();
				setPlayableStreamUrl(buildSeekableTranscodeUrl(resolvedStreamUrl, resumeTime, selectedTranscodeAudioIndex, burnSubtitleIndexRef.current));
				return;
			}

			lastLocalTimeRef.current = video.currentTime;
			const nextTime = streamOffset + video.currentTime;
			const clampedTime = stableDuration > 0 ? Math.min(nextTime, stableDuration) : nextTime;
			currentTimeRef.current = clampedTime;
			setCurrentTime(clampedTime);
		};
		const handlePlay = () => setIsPaused(false);
		const handlePause = () => setIsPaused(true);
		const handleWaiting = () => setIsBuffering(true);
		const handlePlaying = () => setIsBuffering(false);
		// A transcoded stream that reaches "ended" well before the real duration
		// means the ffmpeg pipe died early (an upstream drop the -reconnect flags
		// couldn't ride out). Instead of leaving a dead player, transparently
		// resume the transcode from where playback stopped — the user sees a short
		// buffer instead of "pause à chaque fois". The 3 s throttle (shared with the
		// timeupdate restart path) keeps a truly broken source from hot-looping.
		const handleEnded = () => {
			if (!isTranscodedStream || !resolvedStreamUrl) return;

			const stableDuration = getStableDuration();
			const playedTo = streamOffset + video.currentTime;
			if (
				stableDuration > 0
				&& playedTo < stableDuration - 3
				&& Date.now() - lastTranscodeRestartAtRef.current > 3000
			) {
				lastTranscodeRestartAtRef.current = Date.now();
				setStreamOffset(playedTo);
				setCurrentTime(playedTo);
				currentTimeRef.current = playedTo;
				lastLocalTimeRef.current = 0;
				setIsBuffering(true);
				setPlayableStreamUrl(buildSeekableTranscodeUrl(resolvedStreamUrl, playedTo, selectedTranscodeAudioIndex, burnSubtitleIndexRef.current));
			}
		};

		video.addEventListener("loadedmetadata", handleLoadedMetadata);
		video.addEventListener("durationchange", handleDurationChange);
		video.addEventListener("timeupdate", handleTimeUpdate);
		video.addEventListener("play", handlePlay);
		video.addEventListener("pause", handlePause);
		video.addEventListener("waiting", handleWaiting);
		video.addEventListener("playing", handlePlaying);
		video.addEventListener("ended", handleEnded);
		video.addEventListener("volumechange", syncVolume);
		document.addEventListener("fullscreenchange", syncFullscreen);

		// Stall watchdog. A hiccup on some VOD sources leaves the player stuck
		// buffering forever — no `playing`, `timeupdate`, or `ended` ever fires
		// again, so none of the recovery paths above trigger and the spinner just
		// spins ("charge dans le vide"). We nudge it back to life automatically.
		//
		// Progress is measured on the *stream* position (streamOffset + local
		// time), which stays continuous across a transcode rebuild — a plain local
		// currentTime resets to 0 on rebuild and would be misread as progress,
		// re-arming the watchdog forever. Transcoded streams also buffer
		// legitimately for several seconds, so they get a much longer leash and a
		// hard cap on rebuild attempts so a merely-slow source is never hammered
		// into a permanent reload loop. All memory lives in refs so it survives
		// this effect re-running on each rebuild.
		const STALL_AFTER_MS = isTranscodedStream ? 14000 : 6000;
		const NUDGE_COOLDOWN_MS = isTranscodedStream ? 12000 : 5000;
		const MAX_TRANSCODE_RECOVERIES = 2;
		const PROGRESS_EPSILON = 0.4;

		const stallWatchdog = window.setInterval(() => {
			const now = Date.now();
			const streamPos = streamOffset + video.currentTime;

			if (video.paused || video.seeking || video.ended) {
				stallProgressRef.current = { pos: streamPos, at: now };
				return;
			}

			// First tick after a (re)load: set the baseline without claiming
			// progress, so initial buffering (incl. a resume seek where streamOffset
			// is already high) doesn't arm the watchdog.
			if (stallProgressRef.current.pos < 0) {
				stallProgressRef.current = { pos: streamPos, at: now };
				return;
			}

			// Genuine forward motion → healthy; arm the watchdog and reset the cap.
			if (streamPos > stallProgressRef.current.pos + PROGRESS_EPSILON) {
				stallProgressRef.current = { pos: streamPos, at: now };
				stallEverProgressedRef.current = true;
				stallRecoverAttemptsRef.current = 0;
				return;
			}

			if (!stallEverProgressedRef.current) return;
			if (now - stallProgressRef.current.at < STALL_AFTER_MS) return;
			if (now - stallLastNudgeAtRef.current < NUDGE_COOLDOWN_MS) return;

			// Transcoded: rebuild the ffmpeg pipe from the current position — but
			// only a couple of times. If rebuilding isn't restoring progress the
			// source is just slow/broken, and hammering it makes things worse.
			if (isTranscodedStream && resolvedStreamUrl) {
				if (stallRecoverAttemptsRef.current >= MAX_TRANSCODE_RECOVERIES) return;
				stallRecoverAttemptsRef.current += 1;
				stallLastNudgeAtRef.current = now;
				logger.warn("VOD transcode stalled; rebuilding", {
					attempt: stallRecoverAttemptsRef.current,
					streamPos
				});
				setStreamOffset(streamPos);
				setCurrentTime(streamPos);
				currentTimeRef.current = streamPos;
				lastLocalTimeRef.current = 0;
				lastTranscodeRestartAtRef.current = now;
				setIsBuffering(true);
				setPlayableStreamUrl(buildSeekableTranscodeUrl(resolvedStreamUrl, streamPos, selectedTranscodeAudioIndex, burnSubtitleIndexRef.current));
				return;
			}

			// Native playback: hop a hair forward — into buffered data when we have
			// it — and re-issue play. The automatic version of "bouger la timeline".
			stallLastNudgeAtRef.current = now;
			const buffered = video.buffered;
			let target = video.currentTime + 0.5;
			for (let i = 0; i < buffered.length; i++) {
				if (video.currentTime >= buffered.start(i) - 0.25 && video.currentTime < buffered.end(i)) {
					target = Math.min(buffered.end(i) - 0.1, video.currentTime + 0.5);
					break;
				}
			}
			if (Number.isFinite(video.duration) && video.duration > 0) {
				target = Math.min(target, video.duration - 0.1);
			}
			if (target > video.currentTime) video.currentTime = target;
			void video.play();
		}, 1000);

		return () => {
			window.clearInterval(stallWatchdog);
			video.removeEventListener("loadedmetadata", handleLoadedMetadata);
			video.removeEventListener("durationchange", handleDurationChange);
			video.removeEventListener("timeupdate", handleTimeUpdate);
			video.removeEventListener("play", handlePlay);
			video.removeEventListener("pause", handlePause);
			video.removeEventListener("waiting", handleWaiting);
			video.removeEventListener("playing", handlePlaying);
			video.removeEventListener("ended", handleEnded);
			video.removeEventListener("volumechange", syncVolume);
			document.removeEventListener("fullscreenchange", syncFullscreen);
			transcodePlayerRef.current?.destroy();
			transcodePlayerRef.current = null;
			video.pause();
			video.removeAttribute("src");
			video.load();
		};
	}, [durationOverride, isTranscodedStream, playableStreamUrl, requiresMpegTsPlayer, resolvedStreamUrl, selectedTranscodeAudioIndex, streamOffset, type, videoRef]);

	// Reset prepared subtitle payloads when moving to another media item.
	useEffect(() => {
		subtitleLoadControllerRef.current?.abort();
		subtitleLoadControllerRef.current = null;
		selectedSubtitleIdRef.current = "off";
		burnSubtitleIndexRef.current = null;
		setSelectedSubtitleId("off");
		setSubtitleError(null);
		setSubtitleLoadingId(null);
		setSubtitleTracks((previousTracks) => {
			for (const track of previousTracks) {
				revokeSubtitleRenderSrc(track);
			}
			return [];
		});
	}, [streamUrl, subtitleSignature]);


	// Ask the Electron main process which embedded subtitle streams exist.
	useEffect(() => {
		if (!streamUrl || type !== "vod" || !window.openIptv) {
			setEmbeddedSubtitleTracks([]);
			return;
		}

		let cancelled = false;

		const loadEmbeddedSubtitles = async () => {
			try {
				const result = await window.openIptv?.listEmbeddedSubtitles(streamUrl);
				if (cancelled) return;
				if (result && !result.ok) {
					logger.warn("Embedded subtitle scan failed", {
						error: result.error,
						streamUrl
					});
				}
				setEmbeddedSubtitleTracks(result?.ok ? result.tracks : []);
			} catch (error) {
				if (!cancelled) {
					logger.exception("Failed to list embedded subtitles", error, {
						streamUrl
					});
					setEmbeddedSubtitleTracks([]);
				}
			}
		};

		void loadEmbeddedSubtitles();

		return () => {
			cancelled = true;
		};
	}, [streamUrl, type]);

	// Revoke subtitle blob URLs when the player unmounts.
	useEffect(() => {
		return () => {
			for (const track of subtitleTracksRef.current) {
				revokeSubtitleRenderSrc(track);
			}
			subtitleTracksRef.current = [];
		};
	}, []);

	// If the selected subtitle disappears (e.g. new media), drop back to "off".
	useEffect(() => {
		if (selectedSubtitleId === "off") return;
		if (subtitleOptions.some((option) => option.id === selectedSubtitleId)) return;
		setSelectedSubtitleId("off");
	}, [selectedSubtitleId, subtitleOptions]);

	// Drive the actual <track> visibility from selectedSubtitleId.
	useEffect(() => {
		const video = videoRef.current;
		if (!video) return;

		for (let i = 0; i < video.textTracks.length; i++) {
			video.textTracks[i].mode = selectedSubtitleId === "off" ? "disabled" : "showing";
		}
	}, [selectedSubtitleId, subtitleTracks, videoRef]);

	const loadEmbeddedSubtitleWindow = useCallback(async (
		embeddedTrack: EmbeddedSubtitleTrack,
		positionSeconds: number
	) => {
		if (!streamUrl || !window.openIptv?.extractEmbeddedSubtitleWindow) return false;

		// At higher playback rates the window of media drains proportionally
		// faster, so extract a proportionally wider window to keep the wall-clock
		// re-extraction cadence (and thus the competing ffmpeg spawns) roughly
		// constant instead of doubling at 2×. The main process clamps to 300s.
		const rate = Math.max(1, playbackRateRef.current);
		const windowSeconds = Math.min(300, Math.round(EMBEDDED_SUBTITLE_WINDOW_SECONDS * rate));
		const windowStart = Math.max(0, Math.floor(positionSeconds - EMBEDDED_SUBTITLE_BACKTRACK_SECONDS));
		const requestKey = { id: embeddedTrack.id, start: windowStart };
		embeddedWindowLoadRef.current = requestKey;
		setSubtitleLoadingId(embeddedTrack.id);

		try {
			const result = await window.openIptv.extractEmbeddedSubtitleWindow(
				streamUrl,
				embeddedTrack.index,
				embeddedTrack.relativeIndex,
				windowStart,
				windowSeconds
			);
			if (
				embeddedWindowLoadRef.current?.id !== requestKey.id
				|| embeddedWindowLoadRef.current.start !== requestKey.start
				|| selectedSubtitleIdRef.current !== embeddedTrack.id
			) {
				return false;
			}

			if (!result.ok || result.vtt === undefined) {
				setSubtitleError(result.error ?? "Failed to load subtitle window");
				return false;
			}

			const normalizedVtt = normalizeVtt(result.vtt);
			const renderOffset = subtitleRenderOffsetRef.current;
			const renderSrc = createSubtitleRenderSrc(normalizedVtt, renderOffset);
			const nextWindowStart = result.windowStart ?? windowStart;
			const nextWindowEnd = nextWindowStart + (result.windowDuration ?? windowSeconds);

			const renderedTrack: PlayerSubtitleTrack = {
				id: embeddedTrack.id,
				label: embeddedTrack.label,
				language: embeddedTrack.language,
				src: renderSrc,
				renderSrc,
				normalizedVtt,
				renderOffset,
				ownsRenderSrc: true,
				windowStart: nextWindowStart,
				windowEnd: nextWindowEnd
			};

			setSubtitleTracks((tracks) => {
				for (const track of tracks) {
					if (track.id === embeddedTrack.id) revokeSubtitleRenderSrc(track);
				}
				return [...tracks.filter((track) => track.id !== embeddedTrack.id), renderedTrack];
			});
			setSelectedSubtitleId(embeddedTrack.id);
			return true;
		} catch (error) {
			logger.exception("Failed to load embedded subtitle window", error, {
				streamUrl,
				streamIndex: embeddedTrack.index
			});
			setSubtitleError(error instanceof Error ? error.message : "Failed to load subtitle window");
			return false;
		} finally {
			if (
				embeddedWindowLoadRef.current?.id === requestKey.id
				&& embeddedWindowLoadRef.current.start === requestKey.start
			) {
				embeddedWindowLoadRef.current = null;
			}
			if (selectedSubtitleIdRef.current === embeddedTrack.id) setSubtitleLoadingId(null);
		}
	}, [streamUrl]);

	// Switch into a transcoded re-encode that burns the given bitmap subtitle
	// (PGS/DVD/DVB) into the picture — the only way to show image subtitles in a
	// <video>. Promotes even a natively-played stream into transcoded mode,
	// preserving the current position.
	const applyBurnInSubtitle = useCallback((relativeIndex: number): boolean => {
		const base = transcodeBaseUrlRef.current;
		if (!base) {
			setSubtitleError("Burn-in subtitles aren't available for this stream");
			return false;
		}

		const resumeTime = currentTimeRef.current;
		burnSubtitleIndexRef.current = relativeIndex;
		setBurnSubtitleIndex(relativeIndex);
		setIsTranscodedStream(true);
		setResolvedStreamUrl(base);
		resolvedStreamUrlRef.current = base;
		setStreamOffset(resumeTime);
		setCurrentTime(resumeTime);
		currentTimeRef.current = resumeTime;
		lastLocalTimeRef.current = 0;
		lastTranscodeRestartAtRef.current = Date.now();
		setIsBuffering(true);
		setPlayableStreamUrl(buildSeekableTranscodeUrl(base, resumeTime, selectedTranscodeAudioIndexRef.current, relativeIndex));
		return true;
	}, []);

	// Drop the burned overlay but stay on the transcoded stream — we can't cleanly
	// fall back to native playback mid-movie, so just rebuild the re-encode without
	// the subtitle at the current position.
	const clearBurnInSubtitle = useCallback(() => {
		if (burnSubtitleIndexRef.current === null) return;
		const base = resolvedStreamUrlRef.current ?? transcodeBaseUrlRef.current;
		burnSubtitleIndexRef.current = null;
		setBurnSubtitleIndex(null);
		if (!base) return;

		const resumeTime = currentTimeRef.current;
		setStreamOffset(resumeTime);
		setCurrentTime(resumeTime);
		currentTimeRef.current = resumeTime;
		lastLocalTimeRef.current = 0;
		lastTranscodeRestartAtRef.current = Date.now();
		setIsBuffering(true);
		setPlayableStreamUrl(buildSeekableTranscodeUrl(base, resumeTime, selectedTranscodeAudioIndexRef.current, null));
	}, []);

	const selectSubtitle = useCallback(async (id: string) => {
		setSubtitleError(null);
		subtitleLoadControllerRef.current?.abort();
		subtitleLoadControllerRef.current = null;
		selectedSubtitleIdRef.current = id;

		// Bitmap (PGS/DVD/DVB) embedded subtitles can't become a WebVTT <track>;
		// burn them into the video instead.
		const targetEmbedded = embeddedSubtitleTracks.find((track) => track.id === id);
		if (targetEmbedded?.bitmap) {
			if (targetEmbedded.relativeIndex === undefined) {
				setSubtitleError("This subtitle track can't be burned in");
				return;
			}
			// Re-selecting the already-burned track is a no-op (avoid a restart).
			if (burnSubtitleIndexRef.current === targetEmbedded.relativeIndex) {
				setSelectedSubtitleId(id);
				return;
			}
			setSubtitleLoadingId(null);
			if (applyBurnInSubtitle(targetEmbedded.relativeIndex)) {
				setSelectedSubtitleId(id);
			}
			return;
		}

		// Switching away from a burned subtitle to anything else: tear the overlay
		// down first (rebuilds the transcode without it, still transcoded).
		if (burnSubtitleIndexRef.current !== null) {
			clearBurnInSubtitle();
		}

		if (id === "off") {
			setSubtitleLoadingId(null);
			setSelectedSubtitleId("off");
			return;
		}

		// Already-prepared external (or previously extracted) track.
		if (subtitleTracks.some((track) => track.id === id)) {
			setSubtitleLoadingId(null);
			setSelectedSubtitleId(id);
			return;
		}

		const externalTrack = subtitles.find((track) => getExternalSubtitleId(track) === id);
		if (externalTrack) {
			const controller = new AbortController();
			subtitleLoadControllerRef.current = controller;
			setSubtitleLoadingId(id);

			try {
				const preparedTrack = await prepareSubtitleTrack(
					{ ...externalTrack, id },
					controller.signal,
					subtitleRenderOffsetRef.current
				);
				if (controller.signal.aborted || selectedSubtitleIdRef.current !== id) return;

				setSubtitleTracks((tracks) => {
					for (const track of tracks) {
						if (track.id === id) revokeSubtitleRenderSrc(track);
					}
					return [...tracks.filter((track) => track.id !== id), preparedTrack];
				});
				setSelectedSubtitleId(id);
			} catch (error) {
				if (!isAbortError(error)) {
					logger.exception("Failed to prepare external subtitle", error, {
						streamUrl,
						subtitleId: id
					});
					setSubtitleError(error instanceof Error ? error.message : "Failed to prepare subtitles");
				}
			} finally {
				if (subtitleLoadControllerRef.current === controller) {
					subtitleLoadControllerRef.current = null;
				}
				if (selectedSubtitleIdRef.current === id) setSubtitleLoadingId(null);
			}
			return;
		}

		// Embedded track: load only the subtitle window around the current playback position.
		const embeddedTrack = embeddedSubtitleTracks.find((track) => track.id === id);
		if (!embeddedTrack || !streamUrl || !window.openIptv) {
			setSubtitleError("Subtitle track is unavailable");
			return;
		}

		await loadEmbeddedSubtitleWindow(embeddedTrack, currentTimeRef.current);
	}, [applyBurnInSubtitle, clearBurnInSubtitle, embeddedSubtitleTracks, loadEmbeddedSubtitleWindow, streamUrl, subtitleTracks, subtitles]);

	useEffect(() => {
		if (selectedSubtitleId === "off") return;
		if (!window.openIptv?.extractEmbeddedSubtitleWindow) return;

		const embeddedTrack = embeddedSubtitleTracks.find((track) => track.id === selectedSubtitleId);
		if (!embeddedTrack || embeddedTrack.bitmap) return;

		const preparedTrack = subtitleTracks.find((track) => track.id === selectedSubtitleId);
		if (!preparedTrack?.windowEnd) return;

		// Start the (heavy) re-extraction further ahead when sped up, so the new
		// window is ready before the playhead reaches it instead of being kicked
		// off in a panic mid-stall.
		const lookahead = EMBEDDED_SUBTITLE_LOOKAHEAD_SECONDS * Math.max(1, playbackRate);
		const shouldRefresh =
			currentTime < (preparedTrack.windowStart ?? 0)
			|| currentTime >= preparedTrack.windowEnd - lookahead;
		if (!shouldRefresh) return;
		if (embeddedWindowLoadRef.current?.id === selectedSubtitleId) return;

		void loadEmbeddedSubtitleWindow(embeddedTrack, currentTime);
	}, [currentTime, embeddedSubtitleTracks, loadEmbeddedSubtitleWindow, playbackRate, selectedSubtitleId, subtitleTracks]);

	const togglePlay = useCallback(() => {
		const video = videoRef.current;
		if (!video) return;

		if (video.paused) {
			void video.play();
		} else {
			video.pause();
		}
	}, [videoRef]);

	// Force-repaint subtitle rendering. Chromium can leave the last active cue
	// "stuck" on screen after a seek (it never receives its exit event, and our
	// windowed embedded track only reloads once the new position has buffered).
	// Toggle the showing track off, then re-enable it on the next frame so the
	// overlay is repainted from the cues that are actually active now.
	const clearRenderedCues = useCallback(() => {
		const video = videoRef.current;
		if (!video) return;

		const tracks = video.textTracks;
		for (let i = 0; i < tracks.length; i++) {
			const track = tracks[i];
			if (track.mode !== "showing") continue;
			track.mode = "disabled";
			requestAnimationFrame(() => {
				if (selectedSubtitleIdRef.current !== "off" && track.mode === "disabled") {
					track.mode = "showing";
				}
			});
		}
	}, [videoRef]);

	const seekTo = useCallback((time: number) => {
		const video = videoRef.current;
		if (!video || !Number.isFinite(time)) return;

		const maxTime = durationOverride && durationOverride > 0
			? durationOverride
			: video.duration > 0 ? video.duration : time;
		const nextTime = Math.max(0, Math.min(time, maxTime));

		clearRenderedCues();

		if (isTranscodedStream && resolvedStreamUrl) {
			setStreamOffset(nextTime);
			setCurrentTime(nextTime);
			currentTimeRef.current = nextTime;
			setIsBuffering(true);
			lastLocalTimeRef.current = 0;
			lastTranscodeRestartAtRef.current = Date.now();
			setPlayableStreamUrl(buildSeekableTranscodeUrl(resolvedStreamUrl, nextTime, selectedTranscodeAudioIndex, burnSubtitleIndexRef.current));
			return;
		}

		video.currentTime = nextTime;
		setCurrentTime(video.currentTime);
	}, [clearRenderedCues, durationOverride, isTranscodedStream, resolvedStreamUrl, selectedTranscodeAudioIndex, videoRef]);

	const setVolume = useCallback((value: number) => {
		const video = videoRef.current;
		if (!video) return;

		const nextVolume = Math.max(0, Math.min(value, 1));
		video.volume = nextVolume;
		video.muted = nextVolume === 0;
	}, [videoRef]);

	const setPlaybackRate = useCallback((value: number) => {
		const allowedRates = [0.5, 1, 1.5, 2];
		const nextRate = allowedRates.includes(value) ? value : 1;
		setPlaybackRateState(nextRate);

		const video = videoRef.current;
		if (video) video.playbackRate = nextRate;
	}, [videoRef]);

	const toggleMute = useCallback(() => {
		const video = videoRef.current;
		if (!video) return;

		video.muted = !video.muted;
	}, [videoRef]);

	const toggleFullscreen = useCallback(() => {
		// Fullscreen the whole document, not just the video container: the subtitle
		// settings and stream-info panels are Headless UI dialogs that portal to
		// <body>. If only the container were fullscreen they'd render outside the
		// top layer and be invisible/unclickable. <body> is inside <html>, so they
		// stay interactive this way.
		if (document.fullscreenElement) {
			void document.exitFullscreen();
		} else {
			void document.documentElement.requestFullscreen();
		}
	}, []);

	const changeAudioTrack = useCallback((relativeIndex: number) => {
		// Transcoded stream: rebuild URL with new audio track index and current position.
		if (isTranscodedStream && resolvedStreamUrl) {
			setSelectedTranscodeAudioIndex(relativeIndex);
			setSelectedAudioIndex(relativeIndex);
			setIsBuffering(true);
			setStreamOffset(currentTime);
			currentTimeRef.current = currentTime;
			lastLocalTimeRef.current = 0;
			lastTranscodeRestartAtRef.current = Date.now();
			setPlayableStreamUrl(buildSeekableTranscodeUrl(resolvedStreamUrl, currentTime, relativeIndex, burnSubtitleIndexRef.current));
			return;
		}

		// Native multi-track path (experimental video.audioTracks API).
		const tracks = videoRef.current?.audioTracks;
		if (!tracks) return;

		for (let i = 0; i < tracks.length; i++) {
			tracks[i].enabled = i === relativeIndex;
		}
		setSelectedAudioIndex(relativeIndex);
		setAudioTracks(Array.from(tracks));
	}, [currentTime, isTranscodedStream, resolvedStreamUrl, videoRef]);

	useEffect(() => {
		if (type !== "vod") return;

		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;

			const video = videoRef.current;

			if (event.key === " " || event.code === "Space") {
				event.preventDefault();
				if (video) {
					if (video.paused) void video.play();
					else video.pause();
				}
				return;
			}

			if (event.key === "ArrowUp" || event.key === "ArrowDown") {
				event.preventDefault();
				if (video) {
					const next = Math.max(0, Math.min(1, video.volume + (event.key === "ArrowUp" ? 0.1 : -0.1)));
					video.volume = next;
					video.muted = next === 0;
				}
				return;
			}

			if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
				event.preventDefault();
				const step = event.key === "ArrowLeft" ? -10 : 10;
				const maxTime = duration > 0 ? duration : Number.POSITIVE_INFINITY;
				const nextTime = Math.max(0, Math.min(currentTimeRef.current + step, maxTime));
				seekTo(nextTime);
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [duration, seekTo, type, videoRef]);

	return {
		audioTracks,
		probeAudioTracks,
		currentTime,
		duration,
		isBuffering,
		isFullscreen,
		isMuted,
		isPaused,
		selectedAudioIndex,
		selectedSubtitleId,
		subtitleError,
		subtitleLoadingId,
		subtitleOptions,
		subtitleTracks,
		playbackRate,
		volume,
		changeAudioTrack,
		seekTo,
		selectSubtitle,
		setPlaybackRate,
		setVolume,
		toggleFullscreen,
		toggleMute,
		togglePlay
	};
}
