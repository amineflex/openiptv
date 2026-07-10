import { createLogger } from "./logger";

const logger = createLogger("stream-cache");

const DB_NAME = "openiptv-cache";
const STORE = "streams";
const DB_VERSION = 1;

export interface CacheRecord<T> {
	data: T;
	ts: number;
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
	if (dbPromise) return dbPromise;

	dbPromise = new Promise((resolve) => {
		if (typeof indexedDB === "undefined") {
			resolve(null);
			return;
		}

		let request: IDBOpenDBRequest;
		try {
			request = indexedDB.open(DB_NAME, DB_VERSION);
		} catch (error) {
			logger.warn("IndexedDB unavailable", { error: error instanceof Error ? error.message : String(error) });
			resolve(null);
			return;
		}

		request.onupgradeneeded = () => {
			const db = request.result;
			if (!db.objectStoreNames.contains(STORE)) {
				db.createObjectStore(STORE);
			}
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => {
			logger.warn("IndexedDB open failed", { error: request.error?.message });
			resolve(null);
		};
	});

	return dbPromise;
}

/**
 * Tiny IndexedDB-backed key/value cache for the big Xtream list payloads
 * (e.g. the ~7 MB "All channels" blob). IndexedDB is async and roomy, so it
 * won't block the UI thread or hit the localStorage quota. Every method fails
 * soft — a cache miss or a storage error just falls back to the network.
 */
export const streamCache = {
	async get<T>(key: string): Promise<CacheRecord<T> | null> {
		const db = await openDb();
		if (!db) return null;

		return new Promise((resolve) => {
			try {
				const request = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
				request.onsuccess = () => resolve((request.result as CacheRecord<T> | undefined) ?? null);
				request.onerror = () => resolve(null);
			} catch {
				resolve(null);
			}
		});
	},

	async set<T>(key: string, data: T): Promise<void> {
		const db = await openDb();
		if (!db) return;

		return new Promise((resolve) => {
			try {
				const tx = db.transaction(STORE, "readwrite");
				tx.objectStore(STORE).put({ data, ts: Date.now() }, key);
				tx.oncomplete = () => resolve();
				tx.onerror = () => resolve();
				tx.onabort = () => resolve();
			} catch {
				resolve();
			}
		});
	},

	async clear(): Promise<void> {
		const db = await openDb();
		if (!db) return;

		return new Promise((resolve) => {
			try {
				const tx = db.transaction(STORE, "readwrite");
				tx.objectStore(STORE).clear();
				tx.oncomplete = () => resolve();
				tx.onerror = () => resolve();
				tx.onabort = () => resolve();
			} catch {
				resolve();
			}
		});
	}
};
