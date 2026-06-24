import {
	ArrowLeftIcon,
	ArrowsPointingOutIcon,
	ChatBubbleBottomCenterTextIcon,
	Cog6ToothIcon,
	PauseIcon,
	PlayIcon,
	ArrowTopRightOnSquareIcon,
	SpeakerWaveIcon,
	SpeakerXMarkIcon
} from "@heroicons/react/24/outline";
import { Dialog, DialogPanel, DialogTitle, Select } from "@headlessui/react";
import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { usePictureInPicture } from "../hooks/usePictureInPicture";
import { useVideoPlayer } from "../hooks/useVideoPlayer";
import type { ChannelInfo, SubtitleTrack, WatchNextEpisode } from "../types";

interface PlayerProps {
	streamUrl: string | null;
	channelInfo: ChannelInfo;
	subtitles?: SubtitleTrack[];
	nextEpisode?: WatchNextEpisode;
}

function formatTime(value: number): string {
	if (!Number.isFinite(value) || value <= 0) return "00:00";

	const hours = Math.floor(value / 3600);
	const minutes = Math.floor((value % 3600) / 60).toString().padStart(2, "0");
	const seconds = Math.floor(value % 60).toString().padStart(2, "0");

	return hours > 0 ? `${hours}:${minutes}:${seconds}` : `${minutes}:${seconds}`;
}

function progressStyle(value: number, max = 100) {
	const percentage = max > 0 ? (value / max) * 100 : 0;
	return {
		background: `linear-gradient(to right, #9181ff 0%, #9181ff ${percentage}%, rgba(255,255,255,.2) ${percentage}%, rgba(255,255,255,.2) 100%)`
	};
}

export default function Player({ streamUrl, channelInfo, subtitles = [], nextEpisode }: PlayerProps) {
	const videoRef = useRef<HTMLVideoElement>(null);
	const navigate = useNavigate();
	const [isHovered, setIsHovered] = useState(true);
	const [isSettingsOpen, setIsSettingsOpen] = useState(false);
	const {
		isPictureInPicture,
		isPictureInPictureSupported,
		togglePictureInPicture
	} = usePictureInPicture(videoRef);

	const {
		audioTracks,
		currentTime,
		duration,
		isBuffering,
		isFullscreen,
		isMuted,
		isPaused,
		selectedAudioIndex,
		selectedSubtitleId,
		subtitleError,
		subtitleLoadingId,
		subtitleOptions,
		subtitleTracks,
		volume,
		changeAudioTrack,
		seekTo,
		selectSubtitle,
		setVolume,
		toggleFullscreen,
		toggleMute,
		togglePlay
	} = useVideoPlayer(videoRef, streamUrl, channelInfo.type, subtitles);

	const controlsVisible = isHovered || isPaused || isSettingsOpen;
	const canOfferNextEpisode = Boolean(nextEpisode && duration > 0 && duration - currentTime <= 45);

	const playNextEpisode = () => {
		if (!nextEpisode) return;

		navigate(nextEpisode.route, {
			state: {
				subtitles: nextEpisode.subtitles ?? [],
				nextEpisode: nextEpisode.nextEpisode
			}
		});
	};

	return (
		<div
			className="relative bg-black text-secondary min-h-screen flex items-center justify-center overflow-hidden"
			onMouseMove={() => setIsHovered(true)}
			onMouseLeave={() => setIsHovered(false)}
		>
			<video
				ref={videoRef}
				onClick={togglePlay}
				className="h-screen w-screen bg-black object-contain"
			>
				{subtitleTracks.map((track) => (
					<track
						key={track.id}
						kind="subtitles"
						src={track.renderSrc}
						srcLang={track.language}
						label={track.label}
					/>
				))}
			</video>

			{isBuffering && (
				<div className="absolute inset-0 z-30 flex items-center justify-center bg-black/20">
					<div className="h-12 w-12 animate-spin rounded-full border-2 border-secondary-400 border-t-transparent" />
				</div>
			)}

			<div
				className={`absolute inset-x-0 top-0 z-40 bg-gradient-to-b from-black/80 to-transparent px-5 py-4 transition-opacity duration-200 ${controlsVisible ? "opacity-100" : "opacity-0 pointer-events-none"}`}
			>
				<div className="flex items-center justify-between gap-4">
					<div className="flex min-w-0 items-center gap-3">
						<button
							type="button"
							onClick={() => navigate(-1)}
							className="rounded-full bg-white/10 p-2 text-white hover:bg-secondary-400 hover:text-dark"
						>
							<ArrowLeftIcon className="h-6 w-6" />
						</button>
						<div className="min-w-0">
							<h1 className="truncate text-lg font-bold text-white">{channelInfo.name}</h1>
							{channelInfo.category && <p className="truncate text-sm text-secondary-800">{channelInfo.category}</p>}
						</div>
					</div>
				</div>
			</div>

			{canOfferNextEpisode && nextEpisode && (
				<div className="absolute bottom-28 right-5 z-50 w-[min(28rem,calc(100vw-2.5rem))] rounded-lg border border-white/10 bg-gray-950/95 p-3 text-white shadow-2xl backdrop-blur">
					<div className="flex gap-3">
						{nextEpisode.image && (
							<img
								src={nextEpisode.image}
								alt={nextEpisode.title}
								className="h-20 w-32 flex-none rounded-md bg-black object-cover"
							/>
						)}
						<div className="min-w-0 flex-1">
							<p className="text-xs font-bold uppercase tracking-wide text-secondary-400">Next episode</p>
							<h2 className="mt-1 line-clamp-2 text-base font-bold">{nextEpisode.title}</h2>
							<button
								type="button"
								onClick={playNextEpisode}
								className="mt-3 rounded-md bg-secondary-400 px-4 py-2 text-sm font-bold text-dark hover:bg-secondary"
							>
								Play now
							</button>
						</div>
					</div>
				</div>
			)}

			<div
				className={`absolute inset-x-0 bottom-0 z-40 bg-gradient-to-t from-black via-black/80 to-transparent px-5 pb-5 pt-16 transition-opacity duration-200 ${controlsVisible ? "opacity-100" : "opacity-0 pointer-events-none"}`}
			>
				<input
					type="range"
					min={0}
					max={duration || 0}
					step={0.1}
					value={currentTime}
					onChange={(event) => seekTo(Number(event.target.value))}
					className="player-range mb-4 h-1.5 w-full cursor-pointer appearance-none rounded-full"
					style={progressStyle(currentTime, duration)}
				/>

				<div className="flex flex-wrap items-center justify-between gap-4">
					<div className="flex items-center gap-3">
						<button
							type="button"
							onClick={togglePlay}
							className="rounded-full bg-secondary-400 p-3 text-dark hover:bg-secondary"
						>
							{isPaused ? <PlayIcon className="h-6 w-6" /> : <PauseIcon className="h-6 w-6" />}
						</button>
						<span className="tabular-nums text-sm text-secondary-700">
							{formatTime(currentTime)} / {formatTime(duration)}
						</span>
					</div>

					<div className="flex items-center gap-3">
						<button
							type="button"
							onClick={toggleMute}
							className="rounded-full p-2 text-secondary-700 hover:bg-white/10 hover:text-white"
						>
							{isMuted || volume === 0 ? <SpeakerXMarkIcon className="h-6 w-6" /> : <SpeakerWaveIcon className="h-6 w-6" />}
						</button>
						<input
							type="range"
							min={0}
							max={1}
							step={0.01}
							value={isMuted ? 0 : volume}
							onChange={(event) => setVolume(Number(event.target.value))}
							className="player-range h-1.5 w-24 cursor-pointer appearance-none rounded-full"
							style={progressStyle(isMuted ? 0 : volume, 1)}
						/>
						<button
							type="button"
							onClick={() => setIsSettingsOpen(true)}
							className={`rounded-full p-2 hover:bg-white/10 ${selectedSubtitleId !== "off" ? "text-secondary-400" : "text-secondary-700 hover:text-white"}`}
						>
							<ChatBubbleBottomCenterTextIcon className="h-6 w-6" />
						</button>
						{isPictureInPictureSupported && (
							<button
								type="button"
								onClick={() => void togglePictureInPicture()}
								title="Picture in picture"
								aria-label="Toggle picture in picture"
								className={`rounded-full p-2 hover:bg-white/10 ${isPictureInPicture ? "text-secondary-400" : "text-secondary-700 hover:text-white"}`}
							>
								<ArrowTopRightOnSquareIcon className="h-6 w-6" />
							</button>
						)}
						<button
							type="button"
							onClick={toggleFullscreen}
							className={`rounded-full p-2 hover:bg-white/10 ${isFullscreen ? "text-secondary-400" : "text-secondary-700 hover:text-white"}`}
						>
							<ArrowsPointingOutIcon className="h-6 w-6" />
						</button>
					</div>
				</div>
			</div>

			<Dialog open={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} className="relative z-[60]">
				<div className="fixed inset-0 bg-black/70 backdrop-blur-sm" />
				<div className="fixed inset-0 flex items-stretch justify-end">
					<DialogPanel className="h-full w-full max-w-sm border-l border-white/10 bg-gray-950 p-6 text-white">
						<DialogTitle className="mb-6 flex items-center text-xl font-bold">
							<Cog6ToothIcon className="mr-2 h-6 w-6 text-secondary-400" />
							Playback
						</DialogTitle>

						<div className="space-y-6">
							<div>
								<label className="mb-2 block text-xs font-bold uppercase text-gray-400">Audio Track</label>
								<Select
									value={selectedAudioIndex}
									onChange={(event) => changeAudioTrack(Number(event.target.value))}
									className="block w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white focus:outline-none"
									disabled={audioTracks.length === 0}
								>
									{audioTracks.length === 0 ? (
										<option value={0} className="bg-gray-900">Default audio</option>
									) : (
										audioTracks.map((track, index) => (
											<option key={index} value={index} className="bg-gray-900">
												{track.language?.toUpperCase() || `Track ${index + 1}`} {track.label ? `- ${track.label}` : ""}
											</option>
										))
									)}
								</Select>
							</div>

							<div>
								<label className="mb-2 block text-xs font-bold uppercase text-gray-400">Subtitles</label>
								<Select
									value={selectedSubtitleId}
									onChange={(event) => void selectSubtitle(event.target.value)}
									className="block w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white focus:outline-none"
								>
									<option value="off" className="bg-gray-900">Off</option>
									{subtitleOptions.map((track) => (
										<option key={track.id} value={track.id} className="bg-gray-900">
											{track.label}
										</option>
									))}
								</Select>
								{subtitleLoadingId && (
									<p className="mt-2 text-sm text-secondary-400">Extracting subtitle track...</p>
								)}
								{subtitleError && (
									<p className="mt-2 text-sm text-red-400">{subtitleError}</p>
								)}
								{subtitleOptions.length === 0 && (
									<p className="mt-2 text-sm text-gray-500">No subtitles found from Xtream or embedded tracks.</p>
								)}
							</div>
						</div>
					</DialogPanel>
				</div>
			</Dialog>
		</div>
	);
}
