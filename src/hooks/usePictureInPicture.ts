import { useCallback, useEffect, useState } from "react";
import type { RefObject } from "react";
import { createLogger } from "../services/logger";

const logger = createLogger("picture-in-picture");

export function usePictureInPicture(videoRef: RefObject<HTMLVideoElement | null>) {
	const [isPictureInPicture, setIsPictureInPicture] = useState(false);
	const [isPictureInPictureSupported, setIsPictureInPictureSupported] = useState(false);

	useEffect(() => {
		const video = videoRef.current;
		const supported = Boolean(
			video
			&& "pictureInPictureEnabled" in document
			&& document.pictureInPictureEnabled
			&& "requestPictureInPicture" in video
			&& !video.disablePictureInPicture
		);

		setIsPictureInPictureSupported(supported);
		if (!video || !supported) return;

		const syncState = () => {
			setIsPictureInPicture(document.pictureInPictureElement === video);
		};

		video.addEventListener("enterpictureinpicture", syncState);
		video.addEventListener("leavepictureinpicture", syncState);
		syncState();

		return () => {
			video.removeEventListener("enterpictureinpicture", syncState);
			video.removeEventListener("leavepictureinpicture", syncState);

			if (document.pictureInPictureElement === video) {
				void document.exitPictureInPicture().catch(() => undefined);
			}
		};
	}, [videoRef]);

	const togglePictureInPicture = useCallback(async () => {
		const video = videoRef.current;
		if (!video || !isPictureInPictureSupported) return;

		try {
			if (document.pictureInPictureElement === video) {
				await document.exitPictureInPicture();
				return;
			}

			if (document.pictureInPictureElement) {
				await document.exitPictureInPicture();
			}

			await video.requestPictureInPicture();
		} catch (error) {
			logger.exception("Picture-in-picture toggle failed", error);
		}
	}, [isPictureInPictureSupported, videoRef]);

	return {
		isPictureInPicture,
		isPictureInPictureSupported,
		togglePictureInPicture
	};
}
