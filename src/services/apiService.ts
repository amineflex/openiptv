import type { Category, IptvStream, LiveChannel, SeriesInfo, SeriesItem, StreamInfo, VodInfo, VodStream } from "../types";
import { createLogger } from "./logger";

const API_TIMEOUT_MS = 15000;
const API_HEADERS = {
	Accept: "application/json"
};
const logger = createLogger("api");

type XtreamParams = Record<string, string | number | boolean | undefined>;

async function fetchXtream<T>(
	stream: IptvStream,
	params: XtreamParams = {},
	signal?: AbortSignal
): Promise<T | null> {
	const domain = stream.domain.trim().replace(/\/+$/, "");
	const url = new URL(`${domain}/player_api.php`);
	url.searchParams.set("username", stream.username);
	url.searchParams.set("password", stream.password);

	for (const [key, value] of Object.entries(params)) {
		if (value !== undefined && value !== "all") {
			url.searchParams.set(key, String(value));
		}
	}

	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
	const abort = () => controller.abort();

	signal?.addEventListener("abort", abort, { once: true });

	try {
		const response = await fetch(url.toString(), {
			headers: API_HEADERS,
			signal: controller.signal
		});

		if (!response.ok) {
			logger.error("Xtream request failed", {
				action: params.action ?? "account_info",
				path: url.pathname,
				status: response.status,
				statusText: response.statusText
			});
			return null;
		}

		return (await response.json()) as T;
	} catch (error) {
		if (error instanceof DOMException && error.name === "AbortError") {
			logger.warn("Xtream request timed out or was aborted", {
				action: params.action ?? "account_info",
				path: url.pathname,
				timeoutMs: API_TIMEOUT_MS
			});
		} else {
			logger.exception("Xtream connection error", error, {
				action: params.action ?? "account_info",
				path: url.pathname
			});
		}
		return null;
	} finally {
		clearTimeout(timeoutId);
		signal?.removeEventListener("abort", abort);
	}
}

export const apiService = {
	fetchStreamInfo: (stream: IptvStream, signal?: AbortSignal) =>
		fetchXtream<StreamInfo>(stream, {}, signal),

	fetchLiveCategories: (stream: IptvStream, signal?: AbortSignal) =>
		fetchXtream<Category[]>(stream, { action: "get_live_categories" }, signal),

	fetchLiveStreamsByCategory: (stream: IptvStream, categoryId?: string, signal?: AbortSignal) =>
		fetchXtream<LiveChannel[]>(stream, { action: "get_live_streams", category_id: categoryId }, signal),

	fetchVodCategories: (stream: IptvStream, signal?: AbortSignal) =>
		fetchXtream<Category[]>(stream, { action: "get_vod_categories" }, signal),

	fetchVodStreamsByCategory: (stream: IptvStream, categoryId?: string, signal?: AbortSignal) =>
		fetchXtream<VodStream[]>(stream, { action: "get_vod_streams", category_id: categoryId }, signal),

	fetchVodInfo: (stream: IptvStream, vodId: string | number, signal?: AbortSignal) =>
		fetchXtream<VodInfo>(stream, { action: "get_vod_info", vod_id: vodId }, signal),

	fetchSeriesCategories: (stream: IptvStream, signal?: AbortSignal) =>
		fetchXtream<Category[]>(stream, { action: "get_series_categories" }, signal),

	fetchSeriesByCategory: (stream: IptvStream, categoryId?: string, signal?: AbortSignal) =>
		fetchXtream<SeriesItem[]>(stream, { action: "get_series", category_id: categoryId }, signal),

	fetchSeriesInfo: (stream: IptvStream, seriesId: string | number, signal?: AbortSignal) =>
		fetchXtream<SeriesInfo>(stream, { action: "get_series_info", series_id: seriesId }, signal)
};
