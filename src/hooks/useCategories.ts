import { useState, useEffect } from "react";
import { apiService } from "../services/apiService";
import type { Category, IptvStream } from "../types";

export function useLiveCategories(stream: IptvStream | null) {
	const [categories, setCategories] = useState<Category[]>([]);

	useEffect(() => {
		if (!stream) return;
		const controller = new AbortController();

		apiService.fetchLiveCategories(stream, controller.signal).then((data) => {
			if (!controller.signal.aborted && data) setCategories(data);
		});

		return () => controller.abort();
	}, [stream]);

	return { categories };
}

export function useVodCategories(stream: IptvStream | null) {
	const [categories, setCategories] = useState<Category[]>([]);

	useEffect(() => {
		if (!stream) return;
		const controller = new AbortController();

		apiService.fetchVodCategories(stream, controller.signal).then((data) => {
			if (!controller.signal.aborted && data) setCategories(data);
		});

		return () => controller.abort();
	}, [stream]);

	return { categories };
}

export function useSerieCategories(stream: IptvStream | null) {
	const [categories, setCategories] = useState<Category[]>([]);

	useEffect(() => {
		if (!stream) return;
		const controller = new AbortController();

		apiService.fetchSeriesCategories(stream, controller.signal).then((data) => {
			if (!controller.signal.aborted && data) setCategories(data);
		});

		return () => controller.abort();
	}, [stream]);

	return { categories };
}
