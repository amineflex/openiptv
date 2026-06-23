import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import type { ContentType, EmbeddedSubtitleTrack, SubtitleTrack } from "../types";

interface PlayerSubtitleTrack extends SubtitleTrack {
	renderSrc: string;
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

/**
 * Normalize SubRip or WebVTT text into a clean WebVTT document and nudge every
 * cue upward so subtitles aren't glued to the bottom edge of the video.
 */
function normalizeVtt(raw: string): string {
	const text = raw
		.replace(/^﻿/, "")
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

/**
 * Always fetch the subtitle and re-serve it as a same-origin blob.
 * This converts SRT→VTT and, crucially, sidesteps cross-origin <track>
 * loading failures (Chromium refuses remote VTT tracks without CORS headers).
 */
async function prepareSubtitleTrack(
	track: SubtitleTrack,
	signal: AbortSignal
): Promise<PlayerSubtitleTrack> {
	try {
		const response = await fetch(track.src, { signal });
		if (!response.ok) throw new Error(`HTTP ${response.status}`);

		const text = await response.text();
		const blob = new Blob([normalizeVtt(text)], { type: "text/vtt" });
		return { ...track, renderSrc: URL.createObjectURL(blob) };
	} catch {
		// Network/abort fallback: hand the raw URL to the <track> and hope for the best.
		return { ...track, renderSrc: track.src };
	}
}

export function useVideoPlayer(
	videoRef: RefObject<HTMLVideoElement | null>,
	streamUrl: string | null,
	type: ContentType,
	subtitles: SubtitleTrack[] = []
) {
	const [audioTracks, setAudioTracks] = useState<AudioTrack[]>([]);
	const [selectedAudioIndex, setSelectedAudioIndex] = useState(0);
	const [subtitleTracks, setSubtitleTracks] = useState<PlayerSubtitleTrack[]>([]);
	const [embeddedSubtitleTracks, setEmbeddedSubtitleTracks] = useState<EmbeddedSubtitleTrack[]>([]);
	const [selectedSubtitleId, setSelectedSubtitleId] = useState<string>("off");
	const [subtitleLoadingId, setSubtitleLoadingId] = useState<string | null>(null);
	const [subtitleError, setSubtitleError] = useState<string | null>(null);
	const [playableStreamUrl, setPlayableStreamUrl] = useState<string | null>(null);
	const [durationOverride, setDurationOverride] = useState<number | null>(null);
	const [currentTime, setCurrentTime] = useState(0);
	const [duration, setDuration] = useState(0);
	const [isPaused, setIsPaused] = useState(true);
	const [isMuted, setIsMuted] = useState(false);
	const [volume, setVolumeState] = useState(1);
	const [isBuffering, setIsBuffering] = useState(false);
	const [isFullscreen, setIsFullscreen] = useState(false);

	// Blob URLs created for extracted embedded subtitles, revoked on unmount.
	const embeddedBlobUrls = useRef<string[]>([]);

	const subtitleSignature = useMemo(
		() => subtitles.map((track) => `${track.language}:${track.src}`).join("|"),
		[subtitles]
	);

	const subtitleOptions = useMemo<SubtitleOption[]>(() => {
		const externalIds = new Set(subtitleTracks.map((track) => track.id));

		const external: SubtitleOption[] = subtitleTracks.map((track) => ({
			id: track.id,
			label: track.label,
			language: track.language,
			source: "external"
		}));

		// Only list embedded tracks that have not yet been extracted into subtitleTracks.
		const embedded: SubtitleOption[] = embeddedSubtitleTracks
			.filter((track) => !externalIds.has(track.id))
			.map((track) => ({
				id: track.id,
				label: `${track.label}${track.codec ? ` (${track.codec})` : ""}`,
				language: track.language,
				source: "embedded"
			}));

		return [...external, ...embedded];
	}, [embeddedSubtitleTracks, subtitleTracks]);

	// Keep the player native, but swap AC3/E-AC3 VOD audio to a local AAC stream when needed.
	useEffect(() => {
		let cancelled = false;

		if (!streamUrl) {
			setPlayableStreamUrl(null);
			setDurationOverride(null);
			return;
		}

		if (type !== "vod" || !window.openIptv?.resolvePlayableStream) {
			setPlayableStreamUrl(streamUrl);
			setDurationOverride(null);
			return;
		}

		setPlayableStreamUrl(null);
		setDurationOverride(null);
		setIsBuffering(true);

		const resolvePlayableUrl = async () => {
			try {
				const result = await window.openIptv?.resolvePlayableStream(streamUrl);
				if (cancelled) return;
				setPlayableStreamUrl(result?.ok && result.url ? result.url : streamUrl);
				setDurationOverride(
					result?.durationSeconds && result.durationSeconds > 0 ? result.durationSeconds : null
				);
			} catch {
				if (!cancelled) {
					setPlayableStreamUrl(streamUrl);
					setDurationOverride(null);
				}
			} finally {
				if (!cancelled) setIsBuffering(false);
			}
		};

		void resolvePlayableUrl();

		return () => {
			cancelled = true;
		};
	}, [streamUrl, type]);

	// Attach the video source and wire up playback events (VOD only).
	useEffect(() => {
		const video = videoRef.current;
		if (!video || type !== "vod" || !playableStreamUrl) return;

		video.src = playableStreamUrl;
		video.volume = volume;
		void video.play();

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
		const handleTimeUpdate = () => setCurrentTime(video.currentTime);
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
			video.pause();
			video.removeAttribute("src");
			video.load();
		};
	}, [durationOverride, playableStreamUrl, type, videoRef]);

	// Fetch + convert external (Xtream) subtitles into same-origin blobs.
	useEffect(() => {
		const controller = new AbortController();
		const objectUrls: string[] = [];

		const prepare = async () => {
			const tracks = await Promise.all(
				subtitles.map((track) => prepareSubtitleTrack(track, controller.signal))
			);

			if (controller.signal.aborted) return;

			for (const track of tracks) {
				if (track.renderSrc.startsWith("blob:")) {
					objectUrls.push(track.renderSrc);
				}
			}

			setSubtitleTracks(tracks);
		};

		void prepare();

		return () => {
			controller.abort();
			for (const url of objectUrls) {
				URL.revokeObjectURL(url);
			}
		};
	}, [subtitleSignature]);

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
				setEmbeddedSubtitleTracks(result?.ok ? result.tracks : []);
			} catch {
				if (!cancelled) setEmbeddedSubtitleTracks([]);
			}
		};

		void loadEmbeddedSubtitles();

		return () => {
			cancelled = true;
		};
	}, [streamUrl, type]);

	// Revoke any extracted-embedded blob URLs when the player unmounts.
	useEffect(() => {
		return () => {
			for (const url of embeddedBlobUrls.current) {
				URL.revokeObjectURL(url);
			}
			embeddedBlobUrls.current = [];
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

		const selectedIndex = subtitleTracks.findIndex((track) => track.id === selectedSubtitleId);
		for (let i = 0; i < video.textTracks.length; i++) {
			video.textTracks[i].mode = i === selectedIndex ? "showing" : "disabled";
		}
	}, [selectedSubtitleId, subtitleTracks, videoRef]);

	const selectSubtitle = useCallback(async (id: string) => {
		setSubtitleError(null);

		if (id === "off") {
			setSelectedSubtitleId("off");
			return;
		}

		// Already-prepared external (or previously extracted) track.
		if (subtitleTracks.some((track) => track.id === id)) {
			setSelectedSubtitleId(id);
			return;
		}

		// Embedded track: extract it via ffmpeg in the main process, then add it.
		const embeddedTrack = embeddedSubtitleTracks.find((track) => track.id === id);
		if (!embeddedTrack || !streamUrl || !window.openIptv) {
			setSubtitleError("Subtitle track is unavailable");
			return;
		}

		setSubtitleLoadingId(id);

		try {
			const result = await window.openIptv.extractEmbeddedSubtitle(streamUrl, embeddedTrack.index);

			if (!result.ok || !result.vtt) {
				setSubtitleError(result.error ?? "Failed to extract subtitles");
				return;
			}

			const blobUrl = URL.createObjectURL(new Blob([normalizeVtt(result.vtt)], { type: "text/vtt" }));
			embeddedBlobUrls.current.push(blobUrl);

			const renderedTrack: PlayerSubtitleTrack = {
				id,
				label: embeddedTrack.label,
				language: embeddedTrack.language,
				src: blobUrl,
				renderSrc: blobUrl
			};

			setSubtitleTracks((tracks) => [...tracks.filter((track) => track.id !== id), renderedTrack]);
			setSelectedSubtitleId(id);
		} catch (error) {
			setSubtitleError(error instanceof Error ? error.message : "Failed to extract subtitles");
		} finally {
			setSubtitleLoadingId(null);
		}
	}, [embeddedSubtitleTracks, streamUrl, subtitleTracks]);

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
			: video.duration || time;
		video.currentTime = Math.max(0, Math.min(time, maxTime));
		setCurrentTime(video.currentTime);
	}, [durationOverride, videoRef]);

	const setVolume = useCallback((value: number) => {
		const video = videoRef.current;
		if (!video) return;

		const nextVolume = Math.max(0, Math.min(value, 1));
		video.volume = nextVolume;
		video.muted = nextVolume === 0;
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

	const changeAudioTrack = useCallback((index: number) => {
		const tracks = videoRef.current?.audioTracks;
		if (!tracks) return;

		for (let i = 0; i < tracks.length; i++) {
			tracks[i].enabled = i === index;
		}
		setSelectedAudioIndex(index);
		setAudioTracks(Array.from(tracks));
	}, [videoRef]);

	return {
		audioTracks,
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
		volume,
		changeAudioTrack,
		seekTo,
		selectSubtitle,
		setVolume,
		toggleFullscreen,
		toggleMute,
		togglePlay
	};
}
