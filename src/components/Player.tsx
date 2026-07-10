import {
	ArrowLeftIcon,
	ArrowsPointingOutIcon,
	ChatBubbleBottomCenterTextIcon,
	CheckIcon,
	Cog6ToothIcon,
	InformationCircleIcon,
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
import { useVideoPlayer } from "../hooks/useVideoPlayer";
import { progressService, progressKeyFromUrl } from "../services/progressService";
import StreamInfoPanel from "./StreamInfoPanel";
import type { ChannelInfo, SubtitleTrack, WatchNextEpisode } from "../types";
import { PLACEHOLDER_POSTER } from "../constants";

interface PlayerProps {
	streamUrl: string | null;
	channelInfo: ChannelInfo;
	subtitles?: SubtitleTrack[];
	nextEpisode?: WatchNextEpisode;
	backTo?: string;
	backLabel?: string;
	// Profile id + position (seconds) used to persist and restore playback.
	streamId?: string;
	resumeTime?: number;
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

const LANGUAGE_NAMES: Record<string, string> = {
	ar: "Arabic",
	ara: "Arabic",
	de: "German",
	deu: "German",
	ger: "German",
	en: "English",
	eng: "English",
	es: "Spanish",
	spa: "Spanish",
	fr: "French",
	fra: "French",
	fre: "French",
	it: "Italian",
	ita: "Italian",
	nl: "Dutch",
	dut: "Dutch",
	nld: "Dutch",
	pt: "Portuguese",
	por: "Portuguese",
	tr: "Turkish",
	tur: "Turkish"
};

interface SubtitleUiOption {
	id: string;
	label: string;
	language: string;
	source: "external" | "embedded";
	bitmap?: boolean;
}

function formatSubtitleLanguage(language: string): string {
	const code = language.trim().toLowerCase();
	if (!code || code === "und") return "";
	return LANGUAGE_NAMES[code] ?? code.toUpperCase();
}

function cleanSubtitleLabel(option: SubtitleUiOption): string {
	const label = option.label
		.replace(/\((?:subrip|srt|webvtt|vtt|ass|ssa|mov_text|text)\)/gi, "")
		.replace(/^subtitle$/i, "")
		.trim();
	const language = formatSubtitleLanguage(option.language);
	const code = option.language.trim().toLowerCase();

	if (!label) return "";
	if (label.toLowerCase() === language.toLowerCase()) return "";
	if (code && label.toLowerCase() === code) return "";
	return label;
}

function getSubtitleTitle(option: SubtitleUiOption, index: number): string {
	const language = formatSubtitleLanguage(option.language);
	const label = cleanSubtitleLabel(option);
	return [language, label].filter(Boolean).join(" - ") || `Subtitle ${index + 1}`;
}

function getSubtitleMeta(option: SubtitleUiOption): string {
	if (option.bitmap) return "Image track — burned into video";
	return option.source === "embedded" ? "Embedded track" : "Provider subtitle";
}

export default function Player({ streamUrl, channelInfo, subtitles = [], nextEpisode, backTo, backLabel, streamId, resumeTime }: PlayerProps) {
	const videoRef = useRef<HTMLVideoElement>(null);
	const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const navigate = useNavigate();
	const [isHovered, setIsHovered] = useState(true);
	const [isSettingsOpen, setIsSettingsOpen] = useState(false);
	const [isInfoOpen, setIsInfoOpen] = useState(false);
	const {
		isPictureInPicture,
		isPictureInPictureSupported,
		togglePictureInPicture
	} = usePictureInPicture(videoRef);

	const {
		audioTracks,
		probeAudioTracks,
		currentTime,
		duration,
		isBuffering,
		isFullscreen,
		isMuted,
		isPaused,
		playbackRate,
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
		setPlaybackRate,
		setVolume,
		toggleFullscreen,
		toggleMute,
		togglePlay
	} = useVideoPlayer(videoRef, streamUrl, channelInfo.type, subtitles);

	// Persist playback position every few seconds (and on exit) so the title can
	// be resumed later; near the end progressService drops the entry itself.
	const latestProgress = useRef({ currentTime: 0, duration: 0 });
	useEffect(() => {
		latestProgress.current = { currentTime, duration };
	}, [currentTime, duration]);

	useEffect(() => {
		if (!streamId || channelInfo.type !== "vod") return;
		const key = progressKeyFromUrl(streamUrl);
		if (!key) return;

		const persist = () => {
			const { currentTime: time, duration: total } = latestProgress.current;
			if (time > 0 && total > 0) progressService.save(streamId, key, time, total);
		};

		const interval = window.setInterval(persist, 5000);
		return () => {
			persist();
			window.clearInterval(interval);
		};
	}, [streamId, streamUrl, channelInfo.type]);

	// Jump to the requested resume point once the media reports a duration.
	const resumeAppliedRef = useRef(false);
	useEffect(() => {
		resumeAppliedRef.current = false;
	}, [streamUrl]);
	useEffect(() => {
		if (resumeAppliedRef.current) return;
		if (!resumeTime || resumeTime <= 0 || duration <= 0) return;
		resumeAppliedRef.current = true;
		seekTo(resumeTime);
	}, [duration, resumeTime, seekTo]);

	const controlsVisible = isHovered || isPaused || isSettingsOpen || isInfoOpen;

	const showControls = useCallback(() => {
		setIsHovered(true);
		if (hideTimer.current) clearTimeout(hideTimer.current);
		if (!isPaused && !isSettingsOpen && !isInfoOpen) {
			hideTimer.current = setTimeout(() => setIsHovered(false), 3000);
		}
	}, [isPaused, isSettingsOpen, isInfoOpen]);

	// Keep cursor visible while paused / dialogs open; restart timer on close/play
	useEffect(() => {
		if (isPaused || isSettingsOpen || isInfoOpen) {
			if (hideTimer.current) clearTimeout(hideTimer.current);
			setIsHovered(true);
		} else {
			showControls();
		}
	}, [isPaused, isSettingsOpen, isInfoOpen, showControls]);

	useEffect(() => () => { if (hideTimer.current) clearTimeout(hideTimer.current); }, []);

	const canOfferNextEpisode = Boolean(nextEpisode && duration > 0 && duration - currentTime <= 45);

	const playNextEpisode = () => {
		if (!nextEpisode) return;

		// Replace so the watch history never stacks episode after episode — the
		// back button stays pointed at the page the user actually came from.
		navigate(nextEpisode.route, {
			replace: true,
			state: {
				subtitles: nextEpisode.subtitles ?? [],
				nextEpisode: nextEpisode.nextEpisode,
				backTo,
				backLabel
			}
		});
	};

	const handleBack = () => {
		if (backTo) navigate(backTo, { replace: true });
		else navigate(-1);
	};

	const cyclePlaybackRate = () => {
		const rates = [1, 1.5, 2, 0.5];
		const currentIndex = rates.indexOf(playbackRate);
		setPlaybackRate(rates[(currentIndex + 1) % rates.length]);
	};

	return (
		<div
			className="relative bg-black text-secondary min-h-screen flex items-center justify-center overflow-hidden"
			onMouseMove={showControls}
			onMouseLeave={() => setIsHovered(false)}
			style={{ cursor: controlsVisible ? "default" : "none" }}
		>
			<video
				ref={videoRef}
				onClick={togglePlay}
				className="h-screen w-screen bg-black object-contain"
			>
				{subtitleTracks.filter((track) => track.id === selectedSubtitleId).map((track) => (
					<track
						key={`${track.id}:${track.renderSrc}`}
						kind="subtitles"
						src={track.renderSrc}
						srcLang={track.language}
						label={track.label}
						default
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
							onClick={handleBack}
							title={backLabel ? `Back — ${backLabel}` : "Back"}
							className="flex flex-none items-center gap-1.5 rounded-full bg-white/10 py-2 pl-2 pr-3.5 text-white transition-colors hover:bg-secondary-400 hover:text-dark"
						>
							<ArrowLeftIcon className="h-6 w-6 flex-none" />
							<span className="text-sm font-semibold">Back</span>
						</button>
						<div className="min-w-0">
							<h1 className="truncate text-lg font-bold text-white">{channelInfo.name}</h1>
							{channelInfo.category && <p className="truncate text-sm text-secondary-800">{channelInfo.category}</p>}
						</div>
					</div>

					<button
						type="button"
						onClick={() => setIsInfoOpen(true)}
						title="Stream info"
						className={`flex-none rounded-full bg-white/10 p-2 hover:bg-white/20 ${isInfoOpen ? "text-secondary-400" : "text-white"}`}
					>
						<InformationCircleIcon className="h-6 w-6" />
					</button>
				</div>
			</div>

			{canOfferNextEpisode && nextEpisode && (
				<div className="absolute bottom-28 right-5 z-50 w-[min(28rem,calc(100vw-2.5rem))] rounded-lg border border-white/10 bg-gray-950/95 p-3 text-white shadow-2xl backdrop-blur">
					<div className="flex gap-3">
						<img
							src={nextEpisode.image || PLACEHOLDER_POSTER}
							alt={nextEpisode.title}
							onError={(e) => { (e.currentTarget as HTMLImageElement).src = PLACEHOLDER_POSTER; }}
							className="h-20 w-32 flex-none rounded-md bg-black object-cover"
						/>
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
							onClick={cyclePlaybackRate}
							title="Playback speed"
							aria-label="Change playback speed"
							className={`min-w-14 rounded-full px-3 py-2 text-sm font-bold transition-colors ${
								playbackRate === 1
									? "bg-white/10 text-secondary-700 hover:text-white"
									: "bg-secondary-400 text-dark hover:bg-secondary"
							}`}
						>
							x{playbackRate.toFixed(1)}
						</button>
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
					<DialogPanel className="flex h-full w-full max-w-sm flex-col border-l border-white/10 bg-gray-950 text-white">
						<DialogTitle className="flex shrink-0 items-center border-b border-white/10 px-6 py-5 text-xl font-bold">
							<Cog6ToothIcon className="mr-2 h-6 w-6 text-secondary-400" />
							Playback
						</DialogTitle>

						<div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-5">
							<div>
								<label className="mb-2 block text-xs font-bold uppercase text-gray-400">Audio Track</label>
								{(() => {
									const hasProbe = probeAudioTracks.length > 0;
									const hasNative = audioTracks.length > 0;
									const count = hasProbe ? probeAudioTracks.length : audioTracks.length;
									return (
										<Select
											value={selectedAudioIndex}
											onChange={(event) => changeAudioTrack(Number(event.target.value))}
											className="block w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white focus:outline-none"
											disabled={count === 0}
										>
											{hasProbe ? (
												probeAudioTracks.map((track, index) => {
													const lang = track.language?.trim().toUpperCase() || "";
													const title = track.title?.trim() || "";
													const label = [lang, title].filter(Boolean).join(" — ")
														|| `Track ${index + 1} (${track.codec})`;
													return (
														<option key={index} value={index} className="bg-gray-900">
															{label}
														</option>
													);
												})
											) : hasNative ? (
												audioTracks.map((track, index) => (
													<option key={index} value={index} className="bg-gray-900">
														{track.language?.toUpperCase() || `Track ${index + 1}`}{track.label ? ` — ${track.label}` : ""}
													</option>
												))
											) : (
												<option value={0} className="bg-gray-900">Default audio</option>
											)}
										</Select>
									);
								})()}
							</div>

							<div>
								<label className="mb-2 block text-xs font-bold uppercase text-gray-400">Subtitles</label>
								<div className="max-h-[min(30rem,45vh)] space-y-2 overflow-y-auto pr-1">
									<button
										type="button"
										onClick={() => void selectSubtitle("off")}
										className={`flex w-full items-center justify-between rounded-lg border px-3.5 py-3 text-left transition ${
											selectedSubtitleId === "off"
												? "border-secondary-400 bg-secondary-400/15 text-white"
												: "border-white/10 bg-white/5 text-secondary-800 hover:bg-white/10 hover:text-white"
										}`}
									>
										<span>
											<span className="block text-sm font-semibold">Off</span>
											<span className="mt-0.5 block text-xs text-gray-500">No subtitle track</span>
										</span>
										{selectedSubtitleId === "off" && <CheckIcon className="h-5 w-5 text-secondary-400" />}
									</button>

									{subtitleOptions.map((track, index) => {
										const selected = selectedSubtitleId === track.id;
										const loading = subtitleLoadingId === track.id;
										return (
											<button
												key={track.id}
												type="button"
												onClick={() => void selectSubtitle(track.id)}
												className={`flex w-full items-center justify-between gap-3 rounded-lg border px-3.5 py-3 text-left transition ${
													selected
														? "border-secondary-400 bg-secondary-400/15 text-white"
														: "border-white/10 bg-white/5 text-secondary-800 hover:bg-white/10 hover:text-white"
												}`}
											>
												<span className="min-w-0">
													<span className="block truncate text-sm font-semibold">{getSubtitleTitle(track, index)}</span>
													<span className="mt-1 flex items-center gap-2 text-xs text-gray-500">
														<span className="rounded bg-white/10 px-1.5 py-0.5 uppercase tracking-wide">
															{track.source === "embedded" ? "Embedded" : "Provider"}
														</span>
														{track.bitmap && (
															<span className="rounded bg-amber-500/20 px-1.5 py-0.5 uppercase tracking-wide text-amber-300">
																Image
															</span>
														)}
														<span>{loading ? "Preparing..." : getSubtitleMeta(track)}</span>
													</span>
												</span>
												{loading ? (
													<span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-secondary-400 border-t-transparent" />
												) : selected ? (
													<CheckIcon className="h-5 w-5 shrink-0 text-secondary-400" />
												) : null}
											</button>
										);
									})}
								</div>
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

			<StreamInfoPanel
				open={isInfoOpen}
				streamUrl={streamUrl}
				videoRef={videoRef}
				onClose={() => setIsInfoOpen(false)}
			/>
		</div>
	);
}
