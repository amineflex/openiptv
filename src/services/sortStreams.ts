export type SortMode = "default" | "az" | "za" | "oldest" | "newest";

export interface SortOption {
	value: SortMode;
	label: string;
}

// Name-based sorts, available everywhere.
export const BASE_SORT_OPTIONS: SortOption[] = [
	{ value: "default", label: "Default" },
	{ value: "az", label: "A → Z" },
	{ value: "za", label: "Z → A" }
];

// Date-based sorts, only for content that carries a meaningful date (VOD/Series).
export const DATE_SORT_OPTIONS: SortOption[] = [
	{ value: "oldest", label: "Oldest first" },
	{ value: "newest", label: "Newest first" }
];

interface SortConfig<T> {
	getName: (item: T) => string;
	// Epoch (seconds); omit for lists without a date (e.g. Live TV).
	getDate?: (item: T) => number;
}

/**
 * Return a sorted copy of `items` for the given mode. "default" keeps the
 * incoming order (provider order, or relevance when a search is active). Date
 * modes fall back to the original order when no date accessor is provided.
 */
export function sortStreams<T>(items: T[], mode: SortMode, config: SortConfig<T>): T[] {
	switch (mode) {
		case "az":
			return [...items].sort((a, b) =>
				config.getName(a).localeCompare(config.getName(b), undefined, { numeric: true, sensitivity: "base" })
			);
		case "za":
			return [...items].sort((a, b) =>
				config.getName(b).localeCompare(config.getName(a), undefined, { numeric: true, sensitivity: "base" })
			);
		case "oldest":
			if (!config.getDate) return items;
			return [...items].sort((a, b) => config.getDate!(a) - config.getDate!(b));
		case "newest":
			if (!config.getDate) return items;
			return [...items].sort((a, b) => config.getDate!(b) - config.getDate!(a));
		default:
			return items;
	}
}
