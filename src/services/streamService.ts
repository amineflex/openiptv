import mpegts from "mpegts.js";
import Hls from "hls.js";
import type { StreamFormat } from "../types";
import { createLogger } from "./logger";

type StreamUrlType = "live" | "movie" | "series";

// Both mpegts.js and hls.js players are torn down the same way, so callers can
// hold either behind this shared shape and just call destroy() on cleanup.
export interface LivePlaybackHandle {
	destroy(): void;
}

const logger = createLogger("stream");
const pathPart = (value: string | number): string => encodeURIComponent(String(value));

export function generateStreamUrl(
	domain: string,
	type: StreamUrlType,
	username: string,
	password: string,
	channelId: string | number,
	containerExtension: StreamFormat | string = "ts"
): string {
	const baseUrl = domain.trim().replace(/\/+$/, "");
	return `${baseUrl}/${type}/${pathPart(username)}/${pathPart(password)}/${pathPart(channelId)}.${pathPart(containerExtension)}`;
}

// Start an HLS (.m3u8) live stream with hls.js, falling back to native playback
// where the browser can play HLS directly (Safari). Fatal errors self-recover
// where possible so a brief upstream hiccup doesn't kill the channel.
function startHlsStream(videoElement: HTMLVideoElement, streamUrl: string): LivePlaybackHandle | null {
	if (!Hls.isSupported()) {
		videoElement.src = streamUrl;
		void videoElement.play();
		return null;
	}

	const hls = new Hls({
		enableWorker: true,
		lowLatencyMode: false,
		backBufferLength: 30,
		liveSyncDurationCount: 3,
		manifestLoadingMaxRetry: 4,
		fragLoadingMaxRetry: 6
	});

	hls.on(Hls.Events.MANIFEST_PARSED, () => { void videoElement.play(); });
	hls.on(Hls.Events.ERROR, (_event, data) => {
		if (!data.fatal) return;
		if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
			logger.warn("HLS network error; restarting load", { details: data.details });
			hls.startLoad();
		} else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
			logger.warn("HLS media error; recovering", { details: data.details });
			hls.recoverMediaError();
		} else {
			logger.error("Fatal HLS error; tearing down", { details: data.details });
			hls.destroy();
		}
	});

	hls.loadSource(streamUrl);
	hls.attachMedia(videoElement);
	return hls;
}

export function startStream(
	videoElement: HTMLVideoElement | null,
	streamUrl: string | null,
	isHls = false
): LivePlaybackHandle | null {
	if (!videoElement || !streamUrl) {
		logger.error("Cannot start live stream: missing video element or URL", {
			hasVideoElement: Boolean(videoElement),
			hasStreamUrl: Boolean(streamUrl)
		});
		return null;
	}

	if (isHls) {
		try {
			return startHlsStream(videoElement, streamUrl);
		} catch (error) {
			logger.exception("Failed to initialize HLS stream player", error, { streamUrl });
			return null;
		}
	}

	try {
		if (!mpegts.isSupported()) {
			videoElement.src = streamUrl;
			void videoElement.play();
			return null;
		}

		const player = mpegts.createPlayer({
			type: "mpegts",
			isLive: true,
			url: streamUrl
		}, {
			enableWorker: true,
			lazyLoad: false,
			// Disable aggressive latency chasing to stop the video from jumping (flickering)
			liveBufferLatencyChasing: false,
			// Re-enable stash buffer to smooth out network jitters and stop frequent loading freezes
			enableStashBuffer: true,
			stashInitialSize: 256 * 1024, // 256KB for quick start but stable playback
			fixAudioTimestampGap: true,
			autoCleanupSourceBuffer: true,
			autoCleanupMaxBackwardDuration: 30,
			autoCleanupMinBackwardDuration: 15,
			reuseRedirectedURL: true
		});

		player.attachMediaElement(videoElement);
		player.load();
		player.play();

		return player;
	} catch (error) {
		logger.exception("Failed to initialize live stream player", error, {
			streamUrl
		});
		return null;
	}
}
