// localStorage keys that make up the user's portable config: accounts + their
// per-profile settings, favourites, history and playback progress. The big
// IndexedDB channel cache is intentionally excluded — it's regenerable.
const EXPORT_EXACT = ["streams"];
const EXPORT_PREFIXES = ["stream:", "favourites:", "history:", "progress:"];

const BACKUP_APP = "openiptv";
const BACKUP_VERSION = 1;

function isExportableKey(key: string): boolean {
	return EXPORT_EXACT.includes(key) || EXPORT_PREFIXES.some((prefix) => key.startsWith(prefix));
}

export interface ImportResult {
	ok: boolean;
	count?: number;
	error?: string;
}

export const configService = {
	export(): string {
		const data: Record<string, string> = {};
		for (let i = 0; i < localStorage.length; i++) {
			const key = localStorage.key(i);
			if (!key || !isExportableKey(key)) continue;
			const value = localStorage.getItem(key);
			if (value != null) data[key] = value;
		}
		return JSON.stringify(
			{ app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: new Date().toISOString(), data },
			null,
			2
		);
	},

	import(raw: string): ImportResult {
		let parsed: unknown;
		try {
			parsed = JSON.parse(raw);
		} catch {
			return { ok: false, error: "The file isn't valid JSON." };
		}

		if (
			!parsed ||
			typeof parsed !== "object" ||
			(parsed as { app?: unknown }).app !== BACKUP_APP ||
			typeof (parsed as { data?: unknown }).data !== "object" ||
			(parsed as { data?: unknown }).data === null
		) {
			return { ok: false, error: "This isn't an OpenIPTV backup file." };
		}

		const data = (parsed as { data: Record<string, unknown> }).data;
		let count = 0;
		for (const [key, value] of Object.entries(data)) {
			if (typeof value !== "string" || !isExportableKey(key)) continue;
			localStorage.setItem(key, value);
			count++;
		}

		if (count === 0) return { ok: false, error: "The backup file contained no settings." };
		return { ok: true, count };
	}
};
