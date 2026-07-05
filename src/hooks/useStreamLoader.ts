import { useState, useEffect } from "react";
import { storageService } from "../services/storageService";
import type { IptvStream } from "../types";

export function useStreamLoader(id: string | undefined): IptvStream | null {
	// Resolve synchronously on the first render so pages don't flash
	// "Stream not found" for a frame before the effect runs.
	const [stream, setStream] = useState<IptvStream | null>(() =>
		id ? storageService.getStreamById(id) : null
	);

	useEffect(() => {
		setStream(id ? storageService.getStreamById(id) : null);
	}, [id]);

	return stream;
}
