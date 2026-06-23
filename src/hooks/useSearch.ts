import { useState, useMemo, useCallback } from "react";

interface SearchField<T> {
	getValue: (item: T) => unknown;
	weight?: number;
}

interface UseSearchOptions<T> {
	items: T[];
	fields: SearchField<T>[];
}

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

export function useSearch<T>({ items, fields }: UseSearchOptions<T>) {
	const [query, setQueryState] = useState("");

	const results = useMemo(() => {
		if (!query.trim()) return items;

		return items
			.map((item) => ({ item, score: scoreItem(item, query, fields) }))
			.filter(({ score }) => score > 0)
			.sort((a, b) => b.score - a.score)
			.map(({ item }) => item);
	}, [items, fields, query]);

	const setQuery = useCallback((value: string) => {
		setQueryState(value);
	}, []);

	const clearSearch = useCallback(() => {
		setQueryState("");
	}, []);

	return { query, results, setQuery, clearSearch };
}
