import mpegts from "mpegts.js";
import type { StreamFormat } from "../types";

type StreamUrlType = "live" | "movie" | "series";

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
		console.error("startStream: missing videoElement or streamUrl");
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
			url: streamUrl
		});

		player.attachMediaElement(videoElement);
		player.load();
		player.play();

		return player;
	} catch (error) {
		console.error("startStream: failed to initialize player", error);
		return null;
	}
}
