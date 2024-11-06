import { ArrowLeftIcon } from "@heroicons/react/24/outline";
import React, { useEffect, useRef, useState } from "react";
import { startStream } from "../services/streamService";

export default function Player({ streamUrl, channelInfo }) {
	const videoRef = useRef(null);
	const [isHovered, setIsHovered] = useState(false);

	console.log(channelInfo)

	useEffect(() => {
		let player;

		if (videoRef.current && channelInfo.type === "live_tv") {
			player = startStream(videoRef.current, streamUrl);

			return () => {
				if (player) {
					player.destroy();
				}
			};
		} else if (videoRef.current && channelInfo.type === "vod") {
			videoRef.current.src = streamUrl;
			videoRef.current.play();
		}
	}, [streamUrl]);

	useEffect(() => {
		if (isHovered) {
			const timer = setTimeout(() => {
				setIsHovered(false);
			}, 2500);

			return () => clearTimeout(timer);
		}
	}, [isHovered]);

	return (
		<div
			className="relative bg-black text-secondary min-h-screen flex items-center justify-center"
			onMouseEnter={() => setIsHovered(true)}
			onMouseMove={() => setIsHovered(true)}
			onMouseLeave={() => setIsHovered(false)}
		>
			{isHovered && (
				<div className="absolute top-4 left-4 bg-dark/75 text-white p-4 rounded-lg flex items-center space-x-4 z-50">
					<button onClick={() => history.back()} className=" p-2 hover:bg-primary/30 rounded-full group">
						<ArrowLeftIcon className="h-6 w-6 text-white group-hover:text-secondary-400" />
					</button>
					<div>
						<img src={channelInfo.icon} alt={channelInfo.name} className="max-h-12 min-h-8 w-auto rounded-lg" />
					</div>
					<div>
						<h3 className="text-lg font-semibold">{channelInfo.name}</h3>
						<p className="text-sm text-gray-300">{channelInfo.category}</p>
					</div>
				</div>
			)}

			<video
				ref={videoRef}
				controls
				style={{ width: "100%", height: "100%" }}
				autoPlay={channelInfo.type === "live_tv" ? true : false}
				className={channelInfo.type === "live_tv" ? "live_tv" : ""}
			/>
		</div>
	);
}
