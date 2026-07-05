import type {
	EmbeddedSubtitleListResult,
	EmbeddedSubtitleWindowResult,
	StreamProxyResult,
	PlayableStreamResult,
	LiveStreamResult,
	StreamInfoResult,
	AppUsageStats,
	FfmpegServerStats,
	DownloadActionResult,
	DownloadPlaybackResult,
	DownloadProgress,
	DownloadRecord,
	DownloadStartInput
} from "./types";

declare global {
	interface Window {
		openIptv?: {
			listEmbeddedSubtitles: (streamUrl: string) => Promise<EmbeddedSubtitleListResult>;
			extractEmbeddedSubtitleWindow: (
				streamUrl: string,
				streamIndex: number,
				relativeIndex: number | undefined,
				startSeconds: number,
				durationSeconds: number
			) => Promise<EmbeddedSubtitleWindowResult>;
			resolvePlayableStream: (streamUrl: string) => Promise<PlayableStreamResult>;
			resolveLiveStream: (streamUrl: string) => Promise<LiveStreamResult>;
			createStreamProxy: (streamUrl: string) => Promise<StreamProxyResult>;
			releaseStreamProxy: (proxyId: string) => Promise<{ ok: boolean }>;
			probeStreamInfo: (streamUrl: string) => Promise<StreamInfoResult>;
			stopTranscoding: () => Promise<{ ok: boolean }>;
			getAppUsageStats: () => Promise<AppUsageStats>;
			getFfmpegStats: () => Promise<FfmpegServerStats>;
			// Auto-updater — returns a cleanup function to remove the listener
			onUpdateAvailable: (cb: () => void) => () => void;
			onUpdateDownloaded: (cb: (info: { releaseName: string; releaseNotes?: string }) => void) => () => void;
			installUpdate: () => Promise<void>;
			// Downloads (offline, Netflix-style). Event subscriptions return a
			// cleanup function to remove the listener (call from useEffect).
			downloads: {
				list: () => Promise<DownloadRecord[]>;
				start: (input: DownloadStartInput) => Promise<DownloadActionResult>;
				cancel: (id: string) => Promise<DownloadActionResult>;
				remove: (id: string) => Promise<DownloadActionResult>;
				openFile: (id: string) => Promise<DownloadActionResult>;
				playback: (id: string) => Promise<DownloadPlaybackResult>;
				reveal: (id: string) => Promise<DownloadActionResult>;
				openFolder: () => Promise<DownloadActionResult>;
				onProgress: (cb: (progress: DownloadProgress) => void) => () => void;
				onChanged: (cb: (record: DownloadRecord) => void) => () => void;
				onRemoved: (cb: (payload: { id: string }) => void) => () => void;
			};
			platformInfo: {
				arch: string;
				platform: string;
			};
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
