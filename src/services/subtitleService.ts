import type { SubtitleTrack } from "../types";

function parseSubtitleValue(value: unknown, domain: string): SubtitleTrack[] {
	if (!value) return [];

	if (typeof value === "string") {
		if (value.startsWith("http")) {
			return [{ id: value, label: "Subtitle", language: "und", src: value }];
		}
		try {
			return parseSubtitleValue(JSON.parse(value), domain);
		} catch {
			return [];
		}
	}

	if (Array.isArray(value)) {
		return value.flatMap((item) => parseSubtitleValue(item, domain));
	}

	if (typeof value === "object" && value !== null) {
		const obj = value as Record<string, unknown>;

		if (typeof obj.url === "string" || typeof obj.src === "string") {
			const src = (obj.url ?? obj.src) as string;
			const fullSrc = src.startsWith("http") ? src : `${domain}${src}`;
			return [
				{
					id: src,
					label: String(obj.label ?? obj.language ?? obj.lang ?? "Subtitle"),
					language: String(obj.lang ?? obj.language ?? "und").slice(0, 3),
					src: fullSrc
				}
			];
		}

		return Object.entries(obj).flatMap(([lang, url]) => {
			if (typeof url !== "string") return [];
			const fullSrc = url.startsWith("http") ? url : `${domain}${url}`;
			return [
				{
					id: url,
					label: lang.toUpperCase(),
					language: lang.slice(0, 3),
					src: fullSrc
				}
			];
		});
	}

	return [];
}

export function extractSubtitleTracks(sources: unknown[], domain: string): SubtitleTrack[] {
	const seen = new Set<string>();
	const tracks: SubtitleTrack[] = [];

	for (const source of sources) {
		for (const track of parseSubtitleValue(source, domain)) {
			if (!seen.has(track.src)) {
				seen.add(track.src);
				tracks.push(track);
			}
		}
	}

	return tracks;
}
