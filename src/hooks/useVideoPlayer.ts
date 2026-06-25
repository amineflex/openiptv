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

function buildSeekableTranscodeUrl(url: string, startTime: number, audioIndex = 0): string {
	const nextUrl = new URL(url);
	nextUrl.searchParams.set("start", Math.max(0, startTime).toFixed(3));
	nextUrl.searchParams.set("audio", String(audioIndex));
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
	const transcodePlayerRef = useRef<mpegts.Player | null>(null);

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
				source: "embedded"
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
			setDurationOverride(null);
			setIsTranscodedStream(false);
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
		setDurationOverride(null);
		setIsTranscodedStream(false);
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
				setIsTranscodedStream(shouldUseTranscodeSeek);
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
					setDurationOverride(null);
					setIsTranscodedStream(false);
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

	// Attach the video source and wire up playback events (VOD only).
	useEffect(() => {
		const video = videoRef.current;
		if (!video || type !== "vod" || !playableStreamUrl) return;

		video.volume = volume;
		lastLocalTimeRef.current = 0;
		transcodePlayerRef.current?.destroy();
		transcodePlayerRef.current = null;

		if (isTranscodedStream && mpegts.isSupported()) {
			const player = mpegts.createPlayer({
				type: "mpegts",
				isLive: false,
				url: playableStreamUrl
			}, {
				enableWorker: true,
				lazyLoad: false,
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
			setIsFullscreen(document.fullscreenElement === video.parentElement);
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
				setPlayableStreamUrl(buildSeekableTranscodeUrl(resolvedStreamUrl, resumeTime, selectedTranscodeAudioIndex));
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

		video.addEventListener("loadedmetadata", handleLoadedMetadata);
		video.addEventListener("durationchange", handleDurationChange);
		video.addEventListener("timeupdate", handleTimeUpdate);
		video.addEventListener("play", handlePlay);
		video.addEventListener("pause", handlePause);
		video.addEventListener("waiting", handleWaiting);
		video.addEventListener("playing", handlePlaying);
		video.addEventListener("volumechange", syncVolume);
		document.addEventListener("fullscreenchange", syncFullscreen);

		return () => {
			video.removeEventListener("loadedmetadata", handleLoadedMetadata);
			video.removeEventListener("durationchange", handleDurationChange);
			video.removeEventListener("timeupdate", handleTimeUpdate);
			video.removeEventListener("play", handlePlay);
			video.removeEventListener("pause", handlePause);
			video.removeEventListener("waiting", handleWaiting);
			video.removeEventListener("playing", handlePlaying);
			video.removeEventListener("volumechange", syncVolume);
			document.removeEventListener("fullscreenchange", syncFullscreen);
			transcodePlayerRef.current?.destroy();
			transcodePlayerRef.current = null;
			video.pause();
			video.removeAttribute("src");
			video.load();
		};
	}, [durationOverride, isTranscodedStream, playableStreamUrl, resolvedStreamUrl, selectedTranscodeAudioIndex, streamOffset, type, videoRef]);

	// Reset prepared subtitle payloads when moving to another media item.
	useEffect(() => {
		subtitleLoadControllerRef.current?.abort();
		subtitleLoadControllerRef.current = null;
		selectedSubtitleIdRef.current = "off";
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
				EMBEDDED_SUBTITLE_WINDOW_SECONDS
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
			const nextWindowEnd = nextWindowStart + (result.windowDuration ?? EMBEDDED_SUBTITLE_WINDOW_SECONDS);

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

	const selectSubtitle = useCallback(async (id: string) => {
		setSubtitleError(null);
		subtitleLoadControllerRef.current?.abort();
		subtitleLoadControllerRef.current = null;
		selectedSubtitleIdRef.current = id;

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

		if (window.openIptv.extractEmbeddedSubtitleWindow) {
			await loadEmbeddedSubtitleWindow(embeddedTrack, currentTimeRef.current);
			return;
		}

		setSubtitleLoadingId(id);

		try {
			const result = await window.openIptv.extractEmbeddedSubtitle(streamUrl, embeddedTrack.index);
			if (selectedSubtitleIdRef.current !== id) return;

			if (!result.ok || !result.vtt) {
				logger.warn("Embedded subtitle extraction failed", {
					error: result.error,
					streamIndex: embeddedTrack.index,
					streamUrl
				});
				setSubtitleError(result.error ?? "Failed to extract subtitles");
				return;
			}

			const normalizedVtt = normalizeVtt(result.vtt);
			const renderOffset = subtitleRenderOffsetRef.current;
			const renderSrc = createSubtitleRenderSrc(normalizedVtt, renderOffset);

			const renderedTrack: PlayerSubtitleTrack = {
				id,
				label: embeddedTrack.label,
				language: embeddedTrack.language,
				src: renderSrc,
				renderSrc,
				normalizedVtt,
				renderOffset,
				ownsRenderSrc: true
			};

			setSubtitleTracks((tracks) => {
				for (const track of tracks) {
					if (track.id === id) revokeSubtitleRenderSrc(track);
				}
				return [...tracks.filter((track) => track.id !== id), renderedTrack];
			});
			setSelectedSubtitleId(id);
		} catch (error) {
			logger.exception("Failed to extract embedded subtitles", error, {
				streamIndex: embeddedTrack.index,
				streamUrl
			});
			setSubtitleError(error instanceof Error ? error.message : "Failed to extract subtitles");
		} finally {
			if (selectedSubtitleIdRef.current === id) setSubtitleLoadingId(null);
		}
	}, [embeddedSubtitleTracks, loadEmbeddedSubtitleWindow, streamUrl, subtitleTracks, subtitles]);

	useEffect(() => {
		if (selectedSubtitleId === "off") return;
		if (!window.openIptv?.extractEmbeddedSubtitleWindow) return;

		const embeddedTrack = embeddedSubtitleTracks.find((track) => track.id === selectedSubtitleId);
		if (!embeddedTrack) return;

		const preparedTrack = subtitleTracks.find((track) => track.id === selectedSubtitleId);
		if (!preparedTrack?.windowEnd) return;

		const shouldRefresh =
			currentTime < (preparedTrack.windowStart ?? 0)
			|| currentTime >= preparedTrack.windowEnd - EMBEDDED_SUBTITLE_LOOKAHEAD_SECONDS;
		if (!shouldRefresh) return;
		if (embeddedWindowLoadRef.current?.id === selectedSubtitleId) return;

		void loadEmbeddedSubtitleWindow(embeddedTrack, currentTime);
	}, [currentTime, embeddedSubtitleTracks, loadEmbeddedSubtitleWindow, selectedSubtitleId, subtitleTracks]);

	const togglePlay = useCallback(() => {
		const video = videoRef.current;
		if (!video) return;

		if (video.paused) {
			void video.play();
		} else {
			video.pause();
		}
	}, [videoRef]);

	const seekTo = useCallback((time: number) => {
		const video = videoRef.current;
		if (!video || !Number.isFinite(time)) return;

		const maxTime = durationOverride && durationOverride > 0
			? durationOverride
			: video.duration > 0 ? video.duration : time;
		const nextTime = Math.max(0, Math.min(time, maxTime));

		if (isTranscodedStream && resolvedStreamUrl) {
			setStreamOffset(nextTime);
			setCurrentTime(nextTime);
			currentTimeRef.current = nextTime;
			setIsBuffering(true);
			lastLocalTimeRef.current = 0;
			lastTranscodeRestartAtRef.current = Date.now();
			setPlayableStreamUrl(buildSeekableTranscodeUrl(resolvedStreamUrl, nextTime, selectedTranscodeAudioIndex));
			return;
		}

		video.currentTime = nextTime;
		setCurrentTime(video.currentTime);
	}, [durationOverride, isTranscodedStream, resolvedStreamUrl, selectedTranscodeAudioIndex, videoRef]);

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
		const container = videoRef.current?.parentElement;
		if (!container) return;

		if (document.fullscreenElement) {
			void document.exitFullscreen();
		} else {
			void container.requestFullscreen();
		}
	}, [videoRef]);

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
			setPlayableStreamUrl(buildSeekableTranscodeUrl(resolvedStreamUrl, currentTime, relativeIndex));
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
			if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;

			event.preventDefault();
			const step = event.key === "ArrowLeft" ? -10 : 10;
			const maxTime = duration > 0 ? duration : Number.POSITIVE_INFINITY;
			const nextTime = Math.max(0, Math.min(currentTimeRef.current + step, maxTime));
			seekTo(nextTime);
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [duration, seekTo, type]);

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
