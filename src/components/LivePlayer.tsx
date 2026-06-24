import {
	ArrowLeftIcon,
	ArrowsPointingInIcon,
	ArrowsPointingOutIcon,
	Cog6ToothIcon,
	PauseIcon,
	PlayIcon,
	ArrowTopRightOnSquareIcon,
	SpeakerWaveIcon,
	SpeakerXMarkIcon
} from "@heroicons/react/24/outline";
import { Dialog, DialogPanel, DialogTitle, Select } from "@headlessui/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { usePictureInPicture } from "../hooks/usePictureInPicture";
import { startStream } from "../services/streamService";
import type { ChannelInfo } from "../types";

interface LivePlayerProps {
	streamUrl: string | null;
	channelInfo: ChannelInfo;
}

function progressStyle(value: number, max = 1) {
	const pct = max > 0 ? (value / max) * 100 : 0;
	return {
		background: `linear-gradient(to right, #9181ff 0%, #9181ff ${pct}%, rgba(255,255,255,.2) ${pct}%, rgba(255,255,255,.2) 100%)`
	};
}

export default function LivePlayer({ streamUrl, channelInfo }: LivePlayerProps) {
	const videoRef = useRef<HTMLVideoElement>(null);
	const navigate = useNavigate();
	const mpegtsRef = useRef<ReturnType<typeof startStream>>(null);
	const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

	const [controlsVisible, setControlsVisible] = useState(true);
	const [isBuffering, setIsBuffering] = useState(false);
	const [isPaused, setIsPaused] = useState(false);
	const [isMuted, setIsMuted] = useState(false);
	const [volume, setVolumeState] = useState(1);
	const [isFullscreen, setIsFullscreen] = useState(false);
	const [audioTracks, setAudioTracks] = useState<AudioTrack[]>([]);
	const [selectedAudioIndex, setSelectedAudioIndex] = useState(0);
	const [isSettingsOpen, setIsSettingsOpen] = useState(false);
	const {
		isPictureInPicture,
		isPictureInPictureSupported,
		togglePictureInPicture
	} = usePictureInPicture(videoRef);

	useEffect(() => {
		mpegtsRef.current = startStream(videoRef.current, streamUrl);
		return () => {
			mpegtsRef.current?.destroy();
			mpegtsRef.current = null;
		};
	}, [streamUrl]);

	useEffect(() => {
		const video = videoRef.current;
		if (!video) return;

		const syncAudioTracks = () => {
			const tracks = video.audioTracks;
			if (!tracks) return;
			const arr = Array.from(tracks);
			setAudioTracks(arr);
			const active = arr.findIndex((t) => t.enabled);
			setSelectedAudioIndex(active !== -1 ? active : 0);
		};

		const onWaiting = () => setIsBuffering(true);
		const onPlaying = () => {
			setIsBuffering(false);
			setIsPaused(false);
		};
		const onPause = () => setIsPaused(true);
		const onPlay = () => setIsPaused(false);
		const onVolumeChange = () => {
			setVolumeState(video.volume);
			setIsMuted(video.muted);
		};
		const onFullscreenChange = () =>
			setIsFullscreen(document.fullscreenElement === video.parentElement);

		video.addEventListener("waiting", onWaiting);
		video.addEventListener("playing", onPlaying);
		video.addEventListener("pause", onPause);
		video.addEventListener("play", onPlay);
		video.addEventListener("volumechange", onVolumeChange);
		video.addEventListener("loadedmetadata", syncAudioTracks);
		document.addEventListener("fullscreenchange", onFullscreenChange);

		return () => {
			video.removeEventListener("waiting", onWaiting);
			video.removeEventListener("playing", onPlaying);
			video.removeEventListener("pause", onPause);
			video.removeEventListener("play", onPlay);
			video.removeEventListener("volumechange", onVolumeChange);
			video.removeEventListener("loadedmetadata", syncAudioTracks);
			document.removeEventListener("fullscreenchange", onFullscreenChange);
		};
	}, []);

	const showControls = useCallback(() => {
		setControlsVisible(true);
		if (hideTimer.current) clearTimeout(hideTimer.current);
		if (!isSettingsOpen) {
			hideTimer.current = setTimeout(() => setControlsVisible(false), 2500);
		}
	}, [isSettingsOpen]);

	useEffect(() => {
		if (isSettingsOpen) {
			if (hideTimer.current) clearTimeout(hideTimer.current);
			setControlsVisible(true);
		} else {
			showControls();
		}
	}, [isSettingsOpen, showControls]);

	const togglePlay = () => {
		const video = videoRef.current;
		if (!video) return;
		if (video.paused) {
			void video.play();
		} else {
			video.pause();
		}
	};

	const toggleMute = () => {
		const video = videoRef.current;
		if (!video) return;
		video.muted = !video.muted;
	};

	const handleVolume = (value: number) => {
		const video = videoRef.current;
		if (!video) return;
		video.volume = value;
		video.muted = value === 0;
	};

	const toggleFullscreen = () => {
		const container = videoRef.current?.parentElement;
		if (!container) return;
		if (document.fullscreenElement) {
			void document.exitFullscreen();
		} else {
			void container.requestFullscreen();
		}
	};

	const changeAudioTrack = (index: number) => {
		const tracks = videoRef.current?.audioTracks;
		if (!tracks) return;
		for (let i = 0; i < tracks.length; i++) tracks[i].enabled = i === index;
		setSelectedAudioIndex(index);
		setAudioTracks(Array.from(tracks));
	};

	const overlay = `absolute inset-x-0 z-40 transition-opacity duration-200 ${
		controlsVisible ? "opacity-100" : "opacity-0 pointer-events-none"
	}`;

	return (
		<div
			className="relative min-h-screen overflow-hidden flex items-center justify-center bg-black text-secondary"
			onMouseMove={showControls}
			onMouseLeave={() => setControlsVisible(false)}
			style={{ cursor: controlsVisible ? "default" : "none" }}
		>
			<video
				ref={videoRef}
				autoPlay
				onClick={togglePlay}
				className="h-screen w-screen object-contain bg-black"
			/>

			{isBuffering && (
				<div className="absolute inset-0 z-30 flex items-center justify-center bg-black/20">
					<div className="h-12 w-12 animate-spin rounded-full border-2 border-secondary-400 border-t-transparent" />
				</div>
			)}

			{/* Top bar */}
			<div className={`${overlay} top-0 bg-gradient-to-b from-black/85 to-transparent px-5 py-4`}>
				<div className="flex items-center gap-4">
					<button
						type="button"
						onClick={() => navigate(-1)}
						className="rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-secondary-400 hover:text-dark"
					>
						<ArrowLeftIcon className="h-6 w-6" />
					</button>

					{channelInfo.icon && (
						<img
							src={channelInfo.icon}
							alt={channelInfo.name}
							className="h-10 w-auto rounded-md object-contain"
							onError={(e) => {
								(e.currentTarget as HTMLImageElement).style.display = "none";
							}}
						/>
					)}

					<div className="min-w-0 flex-1">
						<h1 className="truncate text-lg font-bold text-white">{channelInfo.name}</h1>
						{channelInfo.category && (
							<p className="truncate text-sm text-secondary-800">{channelInfo.category}</p>
						)}
					</div>
				</div>
			</div>

			{/* Bottom bar */}
			<div className={`${overlay} bottom-0 bg-gradient-to-t from-black via-black/80 to-transparent px-5 pb-5 pt-12`}>
				<div className="flex flex-wrap items-center justify-between gap-4">
					<div className="flex items-center gap-3">
						<button
							type="button"
							onClick={togglePlay}
							className="rounded-full bg-secondary-400 p-3 text-dark transition-colors hover:bg-secondary"
						>
							{isPaused ? <PlayIcon className="h-6 w-6" /> : <PauseIcon className="h-6 w-6" />}
						</button>
						<div className="flex items-center gap-2 rounded-lg bg-white/10 px-3 py-1.5">
							<span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
							<span className="text-xs font-semibold uppercase tracking-wide text-white">Live</span>
						</div>
					</div>

					<div className="flex items-center gap-3">
						<button
							type="button"
							onClick={toggleMute}
							className="rounded-full p-2 text-secondary-700 transition-colors hover:bg-white/10 hover:text-white"
						>
							{isMuted || volume === 0 ? (
								<SpeakerXMarkIcon className="h-6 w-6" />
							) : (
								<SpeakerWaveIcon className="h-6 w-6" />
							)}
						</button>
						<input
							type="range"
							min={0}
							max={1}
							step={0.01}
							value={isMuted ? 0 : volume}
							onChange={(e) => handleVolume(Number(e.target.value))}
							className="player-range h-1.5 w-24 cursor-pointer appearance-none rounded-full"
							style={progressStyle(isMuted ? 0 : volume, 1)}
						/>

						{audioTracks.length > 1 && (
							<button
								type="button"
								onClick={() => setIsSettingsOpen(true)}
								className="rounded-full p-2 text-secondary-700 transition-colors hover:bg-white/10 hover:text-white"
								title="Audio tracks"
							>
								<Cog6ToothIcon className="h-6 w-6" />
							</button>
						)}

						{isPictureInPictureSupported && (
							<button
								type="button"
								onClick={() => void togglePictureInPicture()}
								title="Picture in picture"
								aria-label="Toggle picture in picture"
								className={`rounded-full p-2 transition-colors hover:bg-white/10 ${
									isPictureInPicture ? "text-secondary-400" : "text-secondary-700 hover:text-white"
								}`}
							>
								<ArrowTopRightOnSquareIcon className="h-6 w-6" />
							</button>
						)}

						<button
							type="button"
							onClick={toggleFullscreen}
							className={`rounded-full p-2 transition-colors hover:bg-white/10 ${
								isFullscreen ? "text-secondary-400" : "text-secondary-700 hover:text-white"
							}`}
						>
							{isFullscreen ? (
								<ArrowsPointingInIcon className="h-6 w-6" />
							) : (
								<ArrowsPointingOutIcon className="h-6 w-6" />
							)}
						</button>
					</div>
				</div>
			</div>

			{/* Audio track dialog */}
			<Dialog open={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} className="relative z-[60]">
				<div className="fixed inset-0 bg-black/70 backdrop-blur-sm" />
				<div className="fixed inset-0 flex items-stretch justify-end">
					<DialogPanel className="h-full w-full max-w-sm border-l border-white/10 bg-gray-950 p-6 text-white">
						<DialogTitle className="mb-6 flex items-center text-xl font-bold">
							<Cog6ToothIcon className="mr-2 h-6 w-6 text-secondary-400" />
							Playback
						</DialogTitle>

						<div>
							<label className="mb-2 block text-xs font-bold uppercase text-gray-400">
								Audio Track
							</label>
							<Select
								value={selectedAudioIndex}
								onChange={(e) => changeAudioTrack(Number(e.target.value))}
								className="block w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white focus:outline-none"
							>
								{audioTracks.map((track, index) => (
									<option key={index} value={index} className="bg-gray-900">
										{track.language?.toUpperCase() || `Track ${index + 1}`}
										{track.label ? ` — ${track.label}` : ""}
									</option>
								))}
							</Select>
						</div>
					</DialogPanel>
				</div>
			</Dialog>
		</div>
	);
}
