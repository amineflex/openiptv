import { useSyncExternalStore } from "react";
import type { DownloadProgress, DownloadRecord, DownloadStartInput } from "../types";
import { downloadsAvailable, downloadsService } from "../services/downloadsService";

// A single app-wide store backs every piece of download UI (buttons on detail
// pages + the Downloads page), so they all stay in sync from one set of IPC
// listeners instead of each component subscribing and re-fetching on its own.

interface DownloadsState {
	records: Record<string, DownloadRecord>;
	// Live transfer speed (bytes/s) per id, kept out of the record so progress
	// ticks don't rewrite persisted fields.
	speeds: Record<string, number>;
	loading: boolean;
}

let state: DownloadsState = { records: {}, speeds: {}, loading: true };
const listeners = new Set<() => void>();
let started = false;

function setState(patch: Partial<DownloadsState>): void {
	state = { ...state, ...patch };
	for (const listener of listeners) listener();
}

function ensureStarted(): void {
	if (started) return;
	started = true;

	const api = window.openIptv?.downloads;
	if (!api) {
		setState({ loading: false });
		return;
	}

	void downloadsService.list().then((list) => {
		const records: Record<string, DownloadRecord> = {};
		for (const record of list) records[record.id] = record;
		setState({ records, loading: false });
	});

	api.onChanged((record: DownloadRecord) => {
		setState({ records: { ...state.records, [record.id]: record } });
	});

	api.onProgress((progress: DownloadProgress) => {
		const existing = state.records[progress.id];
		const records = existing
			? {
				...state.records,
				[progress.id]: {
					...existing,
					status: "downloading" as const,
					received: progress.received,
					total: progress.total > 0 ? progress.total : existing.total
				}
			}
			: state.records;
		setState({ records, speeds: { ...state.speeds, [progress.id]: progress.bytesPerSecond } });
	});

	api.onRemoved(({ id }) => {
		const records = { ...state.records };
		const speeds = { ...state.speeds };
		delete records[id];
		delete speeds[id];
		setState({ records, speeds });
	});
}

function subscribe(callback: () => void): () => void {
	listeners.add(callback);
	return () => listeners.delete(callback);
}

const actions = {
	start: (input: DownloadStartInput) => downloadsService.start(input),
	cancel: (id: string) => downloadsService.cancel(id),
	remove: (id: string) => downloadsService.remove(id),
	openFile: (id: string) => downloadsService.openFile(id),
	playback: (id: string) => downloadsService.playback(id),
	reveal: (id: string) => downloadsService.reveal(id),
	openFolder: () => downloadsService.openFolder()
};

export function useDownloads() {
	ensureStarted();
	const snapshot = useSyncExternalStore(subscribe, () => state, () => state);

	return {
		records: snapshot.records,
		speeds: snapshot.speeds,
		loading: snapshot.loading,
		available: downloadsAvailable(),
		...actions
	};
}
