import type { HistoryItem } from "../types";
import { storageService } from "./storageService";

const STORAGE_KEY = "history";
// Fallback cap when the stream's settings can't be read (e.g. record() called
// before the profile exists). Mirrors DEFAULT_SETTINGS.maxHistoryItems.
const DEFAULT_MAX = 30;

function getStorageKey(streamId: string): string {
	return `${STORAGE_KEY}:${streamId}`;
}

function isHistoryItem(value: unknown): value is HistoryItem {
	if (!value || typeof value !== "object") return false;

	const item = value as Partial<HistoryItem>;
	return (
		typeof item.key === "string" &&
		typeof item.streamId === "string" &&
		(item.type === "movie" || item.type === "series" || item.type === "live") &&
		typeof item.title === "string" &&
		typeof item.route === "string" &&
		typeof item.watchedAt === "string"
	);
}

function read(streamId: string): HistoryItem[] {
	try {
		const raw = localStorage.getItem(getStorageKey(streamId));
		if (!raw) return [];

		const parsed = JSON.parse(raw);
		return Array.isArray(parsed)
			? parsed.filter((item): item is HistoryItem => isHistoryItem(item) && item.streamId === streamId)
			: [];
	} catch {
		return [];
	}
}

function write(streamId: string, items: HistoryItem[]): void {
	localStorage.setItem(getStorageKey(streamId), JSON.stringify(items));
}

function getMax(streamId: string): number {
	const configured = storageService.getStreamById(streamId)?.settings.maxHistoryItems;
	return typeof configured === "number" && configured > 0 ? configured : DEFAULT_MAX;
}

export const historyService = {
	getAll(streamId: string): HistoryItem[] {
		// Stored newest-first; trim defensively in case the cap was lowered.
		return read(streamId).slice(0, getMax(streamId));
	},

	record(item: Omit<HistoryItem, "watchedAt">): void {
		// Drop any previous entry for the same content, then put the fresh one on
		// top so the list reads most-recent-first and never duplicates.
		const withoutDuplicate = read(item.streamId).filter((existing) => existing.key !== item.key);
		const next: HistoryItem[] = [
			{ ...item, watchedAt: new Date().toISOString() },
			...withoutDuplicate
		];
		write(item.streamId, next.slice(0, getMax(item.streamId)));
	},

	remove(streamId: string, key: string): HistoryItem[] {
		const next = read(streamId).filter((item) => item.key !== key);
		write(streamId, next);
		return next;
	},

	clear(streamId: string): void {
		localStorage.removeItem(getStorageKey(streamId));
	},

	// Re-cap immediately when the user lowers the limit in Settings, so the
	// History page reflects the new size without waiting for the next playback.
	applyLimit(streamId: string, max: number): void {
		const limit = max > 0 ? max : DEFAULT_MAX;
		const items = read(streamId);
		if (items.length > limit) write(streamId, items.slice(0, limit));
	}
};
