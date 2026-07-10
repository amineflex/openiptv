import { useEffect, useState } from "react";
import { streamCache } from "../services/streamCache";
import type { Category, IptvStream } from "../types";

// Within this window the cache is trusted outright and the network is skipped
// entirely. Older than this, the cached list is still shown instantly but a
// fresh copy is fetched in the background (stale-while-revalidate), so the big
// "All channels" payload is only re-downloaded when it's actually worth it.
const FRESH_WINDOW_MS = 30 * 60 * 1000;

type StreamFetcher<T> = (
	stream: IptvStream,
	categoryId: string | undefined,
	signal: AbortSignal
) => Promise<T[] | null>;

/**
 * Load a category's streams with an IndexedDB stale-while-revalidate cache.
 * Re-entering a category (especially the huge "All" one) paints instantly from
 * cache instead of re-fetching several megabytes every time.
 */
export function useCachedStreams<T>(
	stream: IptvStream | null,
	selectedCategory: Category | null,
	action: string,
	fetcher: StreamFetcher<T>
): { items: T[]; loading: boolean } {
	const [items, setItems] = useState<T[]>([]);
	const [loading, setLoading] = useState(false);

	useEffect(() => {
		if (!stream || !selectedCategory) {
			setItems([]);
			setLoading(false);
			return;
		}

		const controller = new AbortController();
		const categoryId = selectedCategory.category_id === "all" ? undefined : selectedCategory.category_id;
		const cacheKey = `${stream.id}:${action}:${selectedCategory.category_id}`;
		let active = true;

		const run = async () => {
			const cached = await streamCache.get<T[]>(cacheKey);
			if (!active || controller.signal.aborted) return;

			// Only trust a cache entry that actually holds a list — never an empty
			// or malformed one (a poisoned cache would otherwise blank the page).
			const hasUsableCache = cached && Array.isArray(cached.data) && cached.data.length > 0;
			if (hasUsableCache) {
				setItems(cached.data);
				setLoading(false);
				// Fresh enough — trust the cache and skip the network entirely.
				if (Date.now() - cached.ts < FRESH_WINDOW_MS) return;
			} else {
				setLoading(true);
			}

			const data = await fetcher(stream, categoryId, controller.signal);
			if (!active || controller.signal.aborted) return;

			// Guard against the provider returning null (timeout) or a non-array
			// error object when overloaded — either would blank or crash the list.
			// Keep whatever we already show in that case instead of wiping it.
			if (Array.isArray(data)) {
				setItems(data);
				// Don't cache an empty result: a transient empty response must not
				// stick around for the whole fresh window.
				if (data.length > 0) void streamCache.set(cacheKey, data);
			}
			setLoading(false);
		};

		void run();

		return () => {
			active = false;
			controller.abort();
		};
	}, [stream, selectedCategory, action, fetcher]);

	return { items, loading };
}
