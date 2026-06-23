import { useState, useEffect } from "react";
import { storageService } from "../services/storageService";
import type { IptvStream } from "../types";

export function useStreamLoader(id: string | undefined): IptvStream | null {
	const [stream, setStream] = useState<IptvStream | null>(null);

	useEffect(() => {
		if (!id) return;
		setStream(storageService.getStreamById(id));
	}, [id]);

	return stream;
}
