import type {
	EmbeddedSubtitleExtractResult,
	EmbeddedSubtitleListResult,
	PlayableStreamResult,
	StreamInfoResult
} from "./types";

declare global {
	interface Window {
		openIptv?: {
			listEmbeddedSubtitles: (streamUrl: string) => Promise<EmbeddedSubtitleListResult>;
			extractEmbeddedSubtitle: (
				streamUrl: string,
				streamIndex: number
			) => Promise<EmbeddedSubtitleExtractResult>;
			resolvePlayableStream: (streamUrl: string) => Promise<PlayableStreamResult>;
			probeStreamInfo: (streamUrl: string) => Promise<StreamInfoResult>;
			stopTranscoding: () => Promise<{ ok: boolean }>;
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
