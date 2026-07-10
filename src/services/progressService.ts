export interface PlaybackProgress {
	position: number;
	duration: number;
	updatedAt: string;
}

const STORAGE_KEY = "progress";
// Don't bother remembering the first few seconds, and treat anything past this
// fraction as "finished" so a completed title never shows a resume bar.
const MIN_POSITION_SECONDS = 10;
const COMPLETED_FRACTION = 0.95;
// Cap stored entries per profile so the map can't grow without bound.
const MAX_ENTRIES = 500;

function storageKey(streamId: string): string {
	return `${STORAGE_KEY}:${streamId}`;
}

/**
 * Stable per-title key derived from the stream URL, with the credentials
 * stripped out (path is `/{type}/{user}/{pass}/{id}.{ext}`). Both the player
 * that saves progress and the pages that read it compute the same key.
 */
export function progressKeyFromUrl(streamUrl: string | null | undefined): string | null {
	if (!streamUrl) return null;
	try {
		const url = new URL(streamUrl);
		const segments = url.pathname.split("/").filter(Boolean);
		if (segments.length < 2) return null;
		const type = segments[0];
		const id = segments[segments.length - 1].replace(/\.[^.]+$/, "");
		return id ? `${type}:${id}` : null;
	} catch {
		return null;
	}
}

function readAll(streamId: string): Record<string, PlaybackProgress> {
	try {
		const raw = localStorage.getItem(storageKey(streamId));
		if (!raw) return {};
		const parsed = JSON.parse(raw);
		return parsed && typeof parsed === "object" ? (parsed as Record<string, PlaybackProgress>) : {};
	} catch {
		return {};
	}
}

function writeAll(streamId: string, entries: Record<string, PlaybackProgress>): void {
	const keys = Object.keys(entries);
	if (keys.length > MAX_ENTRIES) {
		// Keep the most recently updated entries only.
		const trimmed = keys
			.sort((a, b) => (entries[b].updatedAt > entries[a].updatedAt ? 1 : -1))
			.slice(0, MAX_ENTRIES);
		const next: Record<string, PlaybackProgress> = {};
		for (const key of trimmed) next[key] = entries[key];
		entries = next;
	}
	localStorage.setItem(storageKey(streamId), JSON.stringify(entries));
}

export const progressService = {
	save(streamId: string, key: string, position: number, duration: number): void {
		if (!streamId || !key) return;
		const entries = readAll(streamId);

		// Near the end → count it as watched, so no lingering resume bar.
		if (duration > 0 && position / duration >= COMPLETED_FRACTION) {
			if (entries[key]) {
				delete entries[key];
				writeAll(streamId, entries);
			}
			return;
		}

		if (position < MIN_POSITION_SECONDS) return;

		entries[key] = { position, duration, updatedAt: new Date().toISOString() };
		writeAll(streamId, entries);
	},

	get(streamId: string, key: string | null): PlaybackProgress | null {
		if (!streamId || !key) return null;
		return readAll(streamId)[key] ?? null;
	},

	getByUrl(streamId: string, streamUrl: string | null): PlaybackProgress | null {
		return this.get(streamId, progressKeyFromUrl(streamUrl));
	},

	remove(streamId: string, key: string): void {
		const entries = readAll(streamId);
		if (entries[key]) {
			delete entries[key];
			writeAll(streamId, entries);
		}
	},

	clear(streamId: string): void {
		localStorage.removeItem(storageKey(streamId));
	}
};
