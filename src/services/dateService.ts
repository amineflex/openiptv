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
