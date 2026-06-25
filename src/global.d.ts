import type {
	EmbeddedSubtitleExtractResult,
	EmbeddedSubtitleListResult,
	EmbeddedSubtitleWindowResult,
	StreamProxyResult,
	PlayableStreamResult,
	StreamInfoResult,
	AppUsageStats
} from "./types";

declare global {
	interface Window {
		openIptv?: {
			listEmbeddedSubtitles: (streamUrl: string) => Promise<EmbeddedSubtitleListResult>;
			extractEmbeddedSubtitle: (
				streamUrl: string,
				streamIndex: number
			) => Promise<EmbeddedSubtitleExtractResult>;
			extractEmbeddedSubtitleWindow: (
				streamUrl: string,
				streamIndex: number,
				relativeIndex: number | undefined,
				startSeconds: number,
				durationSeconds: number
			) => Promise<EmbeddedSubtitleWindowResult>;
			resolvePlayableStream: (streamUrl: string) => Promise<PlayableStreamResult>;
			createStreamProxy: (streamUrl: string) => Promise<StreamProxyResult>;
			releaseStreamProxy: (proxyId: string) => Promise<{ ok: boolean }>;
			probeStreamInfo: (streamUrl: string) => Promise<StreamInfoResult>;
			stopTranscoding: () => Promise<{ ok: boolean }>;
			getAppUsageStats: () => Promise<AppUsageStats>;
			getSystemStats: () => Promise<AppUsageStats>;
		};
	}

	// Audio Track API — experimental, absent from the standard TS DOM lib.
	interface AudioTrack {
		id: string;
		kind: string;
		label: string;
		language: string;
		enabled: boolean;
	}

	interface AudioTrackList {
		readonly length: number;
		[index: number]: AudioTrack;
		getTrackById(id: string): AudioTrack | null;
	}

	interface HTMLVideoElement {
		readonly audioTracks?: AudioTrackList;
	}
}

export {};
