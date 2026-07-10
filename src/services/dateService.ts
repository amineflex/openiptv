const dateFormatter = new Intl.DateTimeFormat("en", {
	day: "numeric",
	month: "short",
	year: "numeric"
});

export function formatReleaseDate(value?: string | number | null): string | null {
	if (value === null || value === undefined) return null;

	const raw = String(value).trim();
	if (!raw) return null;
	if (/^\d{4}$/.test(raw)) return raw;

	const isoMatch = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
	if (isoMatch) {
		const [, year, month, day] = isoMatch;
		const date = new Date(Number(year), Number(month) - 1, Number(day));
		return Number.isNaN(date.getTime()) ? raw : dateFormatter.format(date);
	}

	const date = new Date(raw);
	return Number.isNaN(date.getTime()) ? raw : dateFormatter.format(date);
}

export function getReleaseYear(value?: string | number | null): string | null {
	const formatted = formatReleaseDate(value);
	return formatted?.match(/\b\d{4}\b/)?.[0] ?? null;
}

/** Format a number of seconds as H:MM:SS (or M:SS under an hour). */
export function formatClock(totalSeconds: number): string {
	if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return "0:00";

	const seconds = Math.floor(totalSeconds % 60).toString().padStart(2, "0");
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const hours = Math.floor(totalSeconds / 3600);

	return hours > 0
		? `${hours}:${minutes.toString().padStart(2, "0")}:${seconds}`
		: `${minutes}:${seconds}`;
}

export function formatXtreamDate(value?: string | number | null): string {
	if (!value) return "Unknown";

	const raw = String(value).trim();
	if (!raw) return "Unknown";

	const numeric = Number(raw);
	const date = Number.isFinite(numeric)
		? new Date(numeric * 1000)
		: new Date(raw);

	return Number.isNaN(date.getTime()) ? "Unknown" : dateFormatter.format(date);
}

export type ExpiryTone = "ok" | "soon" | "expired" | "unknown";

export interface ExpiryInfo {
	formatted: string;
	daysLeft: number | null;
	tone: ExpiryTone;
}

/**
 * Turn a raw Xtream `exp_date` into a formatted date plus an urgency tone,
 * so the UI can colour-code how close the subscription is to running out.
 */
export function getExpiryInfo(value?: string | number | null): ExpiryInfo {
	if (value === null || value === undefined || String(value).trim() === "") {
		return { formatted: "Unknown", daysLeft: null, tone: "unknown" };
	}

	const raw = String(value).trim();
	const numeric = Number(raw);
	const date = Number.isFinite(numeric) ? new Date(numeric * 1000) : new Date(raw);

	if (Number.isNaN(date.getTime())) {
		return { formatted: "Unknown", daysLeft: null, tone: "unknown" };
	}

	const daysLeft = Math.ceil((date.getTime() - Date.now()) / 86_400_000);
	const tone: ExpiryTone = daysLeft < 0 ? "expired" : daysLeft <= 7 ? "soon" : "ok";

	return { formatted: dateFormatter.format(date), daysLeft, tone };
}
