import mpegts from "mpegts.js";
import type { StreamFormat } from "../types";
import { createLogger } from "./logger";

type StreamUrlType = "live" | "movie" | "series";

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

export function startStream(videoElement: HTMLVideoElement | null, streamUrl: string | null): mpegts.Player | null {
	if (!videoElement || !streamUrl) {
		logger.error("Cannot start live stream: missing video element or URL", {
			hasVideoElement: Boolean(videoElement),
			hasStreamUrl: Boolean(streamUrl)
		});
		return null;
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
