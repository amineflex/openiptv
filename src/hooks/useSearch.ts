import { useState, useMemo, useCallback, useEffect } from "react";

// Debounce the query used for scoring so typing stays snappy even when the list
// is huge (e.g. the ~20k "All channels" set) — the input updates immediately,
// but the O(n) scoring only re-runs once typing settles.
const SEARCH_DEBOUNCE_MS = 150;

interface SearchField<T> {
	getValue: (item: T) => unknown;
	weight?: number;
}

interface UseSearchOptions<T> {
	items: T[];
	fields: SearchField<T>[];
	// When set, the query is remembered under this key across remounts (e.g. so
	// navigating into a channel and back doesn't wipe the search). Kept in memory
	// only — it resets when the app restarts.
	persistKey?: string;
}

// Session-scoped memory of the last query per persistKey.
const searchMemory = new Map<string, string>();

function normalize(value: string): string {
	return value.toLowerCase().trim();
}

function scoreItem<T>(item: T, query: string, fields: SearchField<T>[]): number {
	const q = normalize(query);
	let total = 0;

	for (const field of fields) {
		const raw = field.getValue(item);
		if (raw == null) continue;
		const text = normalize(String(raw));
		if (text.includes(q)) {
			total += field.weight ?? 1;
		}
	}

	return total;
}

export function useSearch<T>({ items, fields, persistKey }: UseSearchOptions<T>) {
	const initialQuery = persistKey ? searchMemory.get(persistKey) ?? "" : "";
	const [query, setQueryState] = useState(initialQuery);
	// Seed the debounced value too, so a restored query filters immediately on
	// mount instead of flashing the unfiltered list for one debounce interval.
	const [debouncedQuery, setDebouncedQuery] = useState(initialQuery);

	useEffect(() => {
		// Clearing/emptying should feel instant; only defer non-empty queries.
		if (!query.trim()) {
			setDebouncedQuery(query);
			return;
		}
		const timer = setTimeout(() => setDebouncedQuery(query), SEARCH_DEBOUNCE_MS);
		return () => clearTimeout(timer);
	}, [query]);

	const results = useMemo(() => {
		if (!debouncedQuery.trim()) return items;

		return items
			.map((item) => ({ item, score: scoreItem(item, debouncedQuery, fields) }))
			.filter(({ score }) => score > 0)
			.sort((a, b) => b.score - a.score)
			.map(({ item }) => item);
	}, [items, fields, debouncedQuery]);

	const setQuery = useCallback((value: string) => {
		setQueryState(value);
		if (persistKey) {
			if (value) searchMemory.set(persistKey, value);
			else searchMemory.delete(persistKey);
		}
	}, [persistKey]);

	const clearSearch = useCallback(() => {
		setQueryState("");
		if (persistKey) searchMemory.delete(persistKey);
	}, [persistKey]);

	return { query, results, setQuery, clearSearch };
}
