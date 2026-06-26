import type {
	DownloadActionResult,
	DownloadKind,
	DownloadPlaybackResult,
	DownloadRecord,
	DownloadStartInput
} from "../types";

// Deterministic id so re-opening a title resolves to the same download record
// (and therefore the same "already downloaded" UI state).
export function buildDownloadId(streamId: string, kind: DownloadKind, contentId: string | number): string {
	return `${streamId}:${kind}:${contentId}`;
}

function api() {
	return window.openIptv?.downloads;
}

// Rebuild the start payload from a stored record (used to retry a failed or
// canceled download — the record already carries every field we sent).
export function recordToStartInput(record: DownloadRecord): DownloadStartInput {
	return {
		id: record.id,
		streamId: record.streamId,
		kind: record.kind,
		title: record.title,
		subtitle: record.subtitle,
		image: record.image,
		url: record.url,
		container: record.container,
		seriesId: record.seriesId,
		seriesTitle: record.seriesTitle,
		season: record.season,
		episodeNum: record.episodeNum,
		route: record.route,
		subtitles: record.subtitleSources
	};
}

export function downloadsAvailable(): boolean {
	return Boolean(api());
}

export const downloadsService = {
	available: downloadsAvailable,

	async list(): Promise<DownloadRecord[]> {
		return (await api()?.list()) ?? [];
	},

	async start(input: DownloadStartInput): Promise<DownloadActionResult> {
		return (await api()?.start(input)) ?? { ok: false, error: "Downloads unavailable" };
	},

	async cancel(id: string): Promise<DownloadActionResult> {
		return (await api()?.cancel(id)) ?? { ok: false };
	},

	async remove(id: string): Promise<DownloadActionResult> {
		return (await api()?.remove(id)) ?? { ok: false };
	},

	async openFile(id: string): Promise<DownloadActionResult> {
		return (await api()?.openFile(id)) ?? { ok: false };
	},

	async playback(id: string): Promise<DownloadPlaybackResult> {
		return (await api()?.playback(id)) ?? { ok: false, error: "Downloads unavailable" };
	},

	async reveal(id: string): Promise<DownloadActionResult> {
		return (await api()?.reveal(id)) ?? { ok: false };
	},

	async openFolder(): Promise<DownloadActionResult> {
		return (await api()?.openFolder()) ?? { ok: false };
	}
};

export function formatBytes(bytes: number): string {
	if (!bytes || bytes < 0) return "0 B";
	const units = ["B", "KB", "MB", "GB", "TB"];
	const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
	const value = bytes / Math.pow(1024, exponent);
	return `${value.toFixed(value >= 100 || exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

export function formatSpeed(bytesPerSecond: number): string {
	if (!bytesPerSecond || bytesPerSecond <= 0) return "";
	return `${formatBytes(bytesPerSecond)}/s`;
}
