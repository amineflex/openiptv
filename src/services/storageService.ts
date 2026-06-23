import type { Category, IptvStream, SelectedCategoryKey, StreamInput, StreamSettings } from "../types";

const STORAGE_KEYS = {
	STREAMS: "streams",
	SELECTED_CATEGORY: "selectedCategory",
	SELECTED_VOD_CATEGORY: "selectedVodCategory",
	SELECTED_SERIE_CATEGORY: "selectedSerieCategory"
} as const;

export const DEFAULT_SETTINGS: StreamSettings = {
	streamFormat: "ts",
	adultChannel: false,
	hourFormat: "24H",
	maxChannelsPerCategory: 200,
	maxVodPerPage: 50
};

type StoredStream = Partial<IptvStream> & StreamInput;

function createId(): string {
	return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function readJson<T>(key: string, fallback: T): T {
	try {
		const raw = localStorage.getItem(key);
		return raw ? (JSON.parse(raw) as T) : fallback;
	} catch {
		return fallback;
	}
}

function normalizeSettings(settings?: Partial<StreamSettings>): StreamSettings {
	return {
		...DEFAULT_SETTINGS,
		...settings
	};
}

function normalizeStream(stream: StoredStream): IptvStream {
	return {
		...stream,
		id: stream.id ?? createId(),
		name: stream.name,
		domain: stream.domain.trim().replace(/\/+$/, ""),
		username: stream.username,
		password: stream.password,
		expDate: stream.expDate ?? null,
		settings: normalizeSettings(stream.settings)
	};
}

function settingsChanged(stream: StoredStream, normalized: IptvStream): boolean {
	return JSON.stringify(stream.settings ?? null) !== JSON.stringify(normalized.settings);
}

function migrateStreams(streams: StoredStream[]): IptvStream[] {
	let migrated = false;
	const result = streams.map((stream) => {
		const normalized = normalizeStream(stream);
		if (!stream.id || stream.domain !== normalized.domain || settingsChanged(stream, normalized)) {
			migrated = true;
		}
		return normalized;
	});

	if (migrated) {
		localStorage.setItem(STORAGE_KEYS.STREAMS, JSON.stringify(result));
	}

	return result;
}

export const storageService = {
	getStreams(): IptvStream[] {
		const raw = readJson<StoredStream[]>(STORAGE_KEYS.STREAMS, []);
		return migrateStreams(raw);
	},

	getStreamById(id: string): IptvStream | null {
		const streams = this.getStreams();
		return streams.find((s) => s.id === id) || null;
	},

	addStream(streamData: StreamInput): IptvStream {
		const streams = this.getStreams();
		const newStream: IptvStream = {
			...streamData,
			id: createId(),
			domain: streamData.domain.trim().replace(/\/+$/, ""),
			datetime_added: new Date().toISOString(),
			settings: { ...DEFAULT_SETTINGS }
		};

		streams.push(newStream);
		localStorage.setItem(STORAGE_KEYS.STREAMS, JSON.stringify(streams));
		return newStream;
	},

	updateStream(id: string, data: Partial<IptvStream>): IptvStream | null {
		const streams = this.getStreams();
		const index = streams.findIndex((s) => s.id === id);
		if (index === -1) return null;

		streams[index] = normalizeStream({
			...streams[index],
			...data,
			settings: normalizeSettings(data.settings ?? streams[index].settings)
		});
		localStorage.setItem(STORAGE_KEYS.STREAMS, JSON.stringify(streams));
		return streams[index];
	},

	deleteStream(id: string): boolean {
		const streams = this.getStreams();
		const filtered = streams.filter((s) => s.id !== id);
		if (filtered.length === streams.length) return false;
		localStorage.setItem(STORAGE_KEYS.STREAMS, JSON.stringify(filtered));
		return true;
	},

	getSelectedCategory(type: SelectedCategoryKey): Category | null {
		const key = STORAGE_KEYS[type];
		return readJson<Category | null>(key, null);
	},

	setSelectedCategory(type: SelectedCategoryKey, category: Category): void {
		const key = STORAGE_KEYS[type];
		localStorage.setItem(key, JSON.stringify(category));
	}
};
