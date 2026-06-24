import {
	ArrowLeftIcon,
	ArrowsPointingInIcon,
	ArrowsPointingOutIcon,
	Cog6ToothIcon,
	PauseIcon,
	PlayIcon,
	QueueListIcon,
	ArrowTopRightOnSquareIcon,
	SpeakerWaveIcon,
	SpeakerXMarkIcon,
	XMarkIcon,
	InformationCircleIcon
} from "@heroicons/react/24/outline";
import { Dialog, DialogPanel, DialogTitle, Select } from "@headlessui/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { usePictureInPicture } from "../hooks/usePictureInPicture";
import StreamInfoPanel from "./StreamInfoPanel";
import { useStreamLoader } from "../hooks/useStreamLoader";
import { apiService } from "../services/apiService";
import { filterAdultItems } from "../services/adultContentFilter";
import { generateStreamUrl, startStream } from "../services/streamService";
import { buildWatchRoute } from "../services/watchRoute";
import type { ChannelInfo, ChannelSwitcherItem, GuideCategoryItem } from "../types";

interface LivePlayerProps {
	streamUrl: string | null;
	channelInfo: ChannelInfo;
	channels?: ChannelSwitcherItem[];
	categories?: GuideCategoryItem[];
	selectedCategoryId?: string;
	profileId?: string;
}

function progressStyle(value: number, max = 1) {
	const pct = max > 0 ? (value / max) * 100 : 0;
	return {
		background: `linear-gradient(to right, #9181ff 0%, #9181ff ${pct}%, rgba(255,255,255,.2) ${pct}%, rgba(255,255,255,.2) 100%)`
	};
}

function getInitials(name: string): string {
	return name.trim().slice(0, 2).toUpperCase() || "TV";
}

export default function LivePlayer({
	streamUrl,
	channelInfo,
	channels = [],
	categories = [],
	selectedCategoryId = "",
	profileId
}: LivePlayerProps) {
	const videoRef = useRef<HTMLVideoElement>(null);
	const navigate = useNavigate();
	const stream = useStreamLoader(profileId);
	const mpegtsRef = useRef<ReturnType<typeof startStream>>(null);
	const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const channelListRef = useRef<HTMLDivElement>(null);

	// Video playback state
	const [controlsVisible, setControlsVisible] = useState(true);
	const [isBuffering, setIsBuffering] = useState(false);
	const [isPaused, setIsPaused] = useState(false);
	const [isMuted, setIsMuted] = useState(false);
	const [volume, setVolumeState] = useState(1);
	const [isFullscreen, setIsFullscreen] = useState(false);
	const [audioTracks, setAudioTracks] = useState<AudioTrack[]>([]);
	const [selectedAudioIndex, setSelectedAudioIndex] = useState(0);
	const [isSettingsOpen, setIsSettingsOpen] = useState(false);
	const [isInfoOpen, setIsInfoOpen] = useState(false);

	// Channel guide state
	const [isChannelGuideOpen, setIsChannelGuideOpen] = useState(false);
	const [guideCategoryId, setGuideCategoryId] = useState(selectedCategoryId);
	const [guideChannels, setGuideChannels] = useState<ChannelSwitcherItem[]>(channels);
	const [guideLoading, setGuideLoading] = useState(false);
	const [focusedChannelIndex, setFocusedChannelIndex] = useState(0);
	const channelItemRefs = useRef<(HTMLButtonElement | null)[]>([]);
	const focusedIndexRef = useRef(0);

	const guideChannelLimit = stream?.settings.maxChannelsPerCategory ?? 200;

	const {
		isPictureInPicture,
		isPictureInPictureSupported,
		togglePictureInPicture
	} = usePictureInPicture(videoRef);

	// ── Stream setup ──────────────────────────────────────────────────────────

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
		const onPlaying = () => { setIsBuffering(false); setIsPaused(false); };
		const onPause = () => setIsPaused(true);
		const onPlay = () => setIsPaused(false);
		const onVolumeChange = () => { setVolumeState(video.volume); setIsMuted(video.muted); };
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

	// ── Controls visibility ───────────────────────────────────────────────────

	const showControls = useCallback(() => {
		setControlsVisible(true);
		if (hideTimer.current) clearTimeout(hideTimer.current);
		if (!isSettingsOpen && !isChannelGuideOpen) {
			hideTimer.current = setTimeout(() => setControlsVisible(false), 2500);
		}
	}, [isSettingsOpen, isChannelGuideOpen]);

	useEffect(() => {
		if (isSettingsOpen || isChannelGuideOpen) {
			if (hideTimer.current) clearTimeout(hideTimer.current);
			setControlsVisible(true);
		} else {
			showControls();
		}
	}, [isSettingsOpen, isChannelGuideOpen, showControls]);

	// ── Channel guide: category switching + fetch ────────────────────────────

	// Reset guide when navigating to a new channel (prop changes)
	useEffect(() => {
		setGuideCategoryId(selectedCategoryId);
	}, [selectedCategoryId]);

	useEffect(() => {
		setGuideChannels(channels);
	}, [channels]);

	// Fetch channels when the guide category differs from the current one
	useEffect(() => {
		if (!guideCategoryId || guideCategoryId === selectedCategoryId) return;
		if (!stream) return;

		const controller = new AbortController();
		setGuideLoading(true);
		setGuideChannels([]);

		const fetchChannels = async () => {
			const catId = guideCategoryId === "all" ? undefined : guideCategoryId;
			const data = await apiService.fetchLiveStreamsByCategory(stream, catId, controller.signal);
			if (controller.signal.aborted) return;

			const categoryName = categories.find((c) => c.id === guideCategoryId)?.name ?? "";
			const items: ChannelSwitcherItem[] = filterAdultItems(
				data ?? [],
				stream.settings.adultChannel,
				categoryName
			).map((ch) => ({
				name: ch.name,
				icon: ch.stream_icon ?? "",
				num: ch.num,
				url: buildWatchRoute({
					src: generateStreamUrl(
						stream.domain, "live", stream.username, stream.password,
						ch.stream_id, stream.settings.streamFormat
					),
					type: "live_tv",
					channel: ch.name,
					icon: ch.stream_icon,
					category: categoryName
				})
			}));

			setGuideChannels(items);
			setGuideLoading(false);
			requestAnimationFrame(() => channelListRef.current?.scrollTo({ top: 0 }));
		};

		void fetchChannels();
		return () => controller.abort();
	}, [guideCategoryId, selectedCategoryId, stream, categories]);

	// ── Channel guide: current channel detection ──────────────────────────────

	const limitedChannels = useMemo(
		() => guideChannels.slice(0, guideChannelLimit),
		[guideChannels, guideChannelLimit]
	);
	const hasMore = guideChannels.length > guideChannelLimit;

	const currentChannelIndex = useMemo(() => {
		if (!streamUrl || limitedChannels.length === 0) return -1;
		return limitedChannels.findIndex((ch) => {
			try {
				return new URL(ch.url, window.location.origin).searchParams.get("src") === streamUrl;
			} catch { return false; }
		});
	}, [limitedChannels, streamUrl]);

	// ── Channel guide: keyboard navigation ────────────────────────────────────

	useEffect(() => { focusedIndexRef.current = focusedChannelIndex; }, [focusedChannelIndex]);

	// When guide opens, jump to the current channel
	useEffect(() => {
		if (!isChannelGuideOpen) return;
		const idx = currentChannelIndex >= 0 ? currentChannelIndex : 0;
		setFocusedChannelIndex(idx);
		focusedIndexRef.current = idx;
		requestAnimationFrame(() => {
			channelItemRefs.current[idx]?.scrollIntoView({ block: "center", behavior: "instant" });
		});
	}, [isChannelGuideOpen, currentChannelIndex]);

	const switchToChannel = useCallback((url: string) => {
		setIsChannelGuideOpen(false);
		navigate(url, {
			state: {
				channels: guideChannels,
				categories,
				selectedCategoryId: guideCategoryId,
				profileId
			}
		});
	}, [navigate, guideChannels, categories, guideCategoryId, profileId]);

	const switchRef = useRef(switchToChannel);
	useEffect(() => { switchRef.current = switchToChannel; }, [switchToChannel]);

	useEffect(() => {
		if (!isChannelGuideOpen || limitedChannels.length === 0) return;
		const handleKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") { setIsChannelGuideOpen(false); return; }
			if (e.key === "ArrowUp") {
				e.preventDefault();
				const next = Math.max(0, focusedIndexRef.current - 1);
				focusedIndexRef.current = next;
				setFocusedChannelIndex(next);
				channelItemRefs.current[next]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
				return;
			}
			if (e.key === "ArrowDown") {
				e.preventDefault();
				const next = Math.min(limitedChannels.length - 1, focusedIndexRef.current + 1);
				focusedIndexRef.current = next;
				setFocusedChannelIndex(next);
				channelItemRefs.current[next]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
				return;
			}
			if (e.key === "Enter") {
				const ch = limitedChannels[focusedIndexRef.current];
				if (ch) switchRef.current(ch.url);
			}
		};
		window.addEventListener("keydown", handleKey);
		return () => window.removeEventListener("keydown", handleKey);
	}, [isChannelGuideOpen, limitedChannels]);

	// ── Video controls ────────────────────────────────────────────────────────

	const togglePlay = () => {
		const video = videoRef.current;
		if (!video) return;
		if (video.paused) void video.play(); else video.pause();
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
		if (document.fullscreenElement) void document.exitFullscreen();
		else void container.requestFullscreen();
	};

	const changeAudioTrack = (index: number) => {
		const tracks = videoRef.current?.audioTracks;
		if (!tracks) return;
		for (let i = 0; i < tracks.length; i++) tracks[i].enabled = i === index;
		setSelectedAudioIndex(index);
		setAudioTracks(Array.from(tracks));
	};

	const handleCategoryClick = (catId: string) => {
		setGuideCategoryId(catId);
		setFocusedChannelIndex(0);
		focusedIndexRef.current = 0;
	};

	const overlay = `absolute inset-x-0 z-40 transition-opacity duration-200 ${
		controlsVisible ? "opacity-100" : "opacity-0 pointer-events-none"
	}`;

	// ── Render ────────────────────────────────────────────────────────────────

	return (
		<div
			className="relative flex min-h-screen items-center justify-center overflow-hidden bg-black text-secondary"
			onMouseMove={showControls}
			onMouseLeave={() => setControlsVisible(false)}
			style={{ cursor: controlsVisible ? "default" : "none" }}
		>
			<video
				ref={videoRef}
				autoPlay
				onClick={togglePlay}
				className="h-screen w-screen bg-black object-contain"
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
							onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
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

						{(channels.length > 0 || categories.length > 0) && (
							<button
								type="button"
								onClick={() => setIsChannelGuideOpen(true)}
								title="Channel guide"
								className={`rounded-full p-2 transition-colors hover:bg-white/10 ${
									isChannelGuideOpen ? "text-secondary-400" : "text-secondary-700 hover:text-white"
								}`}
							>
								<QueueListIcon className="h-6 w-6" />
							</button>
						)}

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
							onClick={() => setIsInfoOpen(true)}
							title="Stream info"
							className={`rounded-full p-2 transition-colors hover:bg-white/10 ${
								isInfoOpen ? "text-secondary-400" : "text-secondary-700 hover:text-white"
							}`}
						>
							<InformationCircleIcon className="h-6 w-6" />
						</button>

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

			{/* ── Audio track settings ─────────────────────────────────────────── */}
			<Dialog open={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} className="relative z-[60]">
				<div className="fixed inset-0 bg-black/70 backdrop-blur-sm" />
				<div className="fixed inset-0 flex items-stretch justify-end">
					<DialogPanel className="h-full w-full max-w-sm border-l border-white/10 bg-gray-950 p-6 text-white">
						<DialogTitle className="mb-6 flex items-center text-xl font-bold">
							<Cog6ToothIcon className="mr-2 h-6 w-6 text-secondary-400" />
							Playback
						</DialogTitle>
						<div>
							<label className="mb-2 block text-xs font-bold uppercase text-gray-400">Audio Track</label>
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

			{/* ── Channel guide ────────────────────────────────────────────────── */}
			<Dialog open={isChannelGuideOpen} onClose={() => setIsChannelGuideOpen(false)} className="relative z-[60]">
				<div className="fixed inset-0 bg-black/60 backdrop-blur-sm" />
				<div className="fixed inset-0 flex items-stretch justify-end">
					<DialogPanel className="flex h-full w-full max-w-xs flex-col border-l border-white/10 bg-gray-950">

						{/* Header */}
						<div className="flex shrink-0 items-center justify-between border-b border-white/10 px-5 py-4">
							<DialogTitle className="flex items-center gap-2 text-lg font-bold text-white">
								<QueueListIcon className="h-5 w-5 text-secondary-400" />
								Channel Guide
								{guideChannels.length > 0 && (
									<span className="rounded-full bg-white/10 px-2 py-0.5 text-xs font-semibold text-secondary-700">
										{guideChannels.length}
									</span>
								)}
							</DialogTitle>
							<button
								type="button"
								onClick={() => setIsChannelGuideOpen(false)}
								className="rounded-full p-1.5 text-gray-400 transition hover:bg-white/10 hover:text-white"
							>
								<XMarkIcon className="h-5 w-5" />
							</button>
						</div>

						{/* Category chips */}
						{categories.length > 0 && (
							<div className="shrink-0 border-b border-white/10">
								<div className="flex gap-2 overflow-x-auto px-4 py-2.5 [scrollbar-width:none]">
									{categories.map((cat) => (
										<button
											key={cat.id}
											type="button"
											onClick={() => handleCategoryClick(cat.id)}
											className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition-colors whitespace-nowrap ${
												cat.id === guideCategoryId
													? "bg-secondary-400 text-dark"
													: "bg-white/10 text-secondary-800 hover:bg-white/15 hover:text-white"
											}`}
										>
											{cat.name}
										</button>
									))}
								</div>
							</div>
						)}

						{/* Channel list */}
						<div ref={channelListRef} className="flex-1 overflow-y-auto py-1">
							{guideLoading ? (
								<div className="flex flex-col gap-1 px-4 py-3">
									{Array.from({ length: 8 }).map((_, i) => (
										<div key={i} className="flex items-center gap-3 py-2">
											<div className="h-9 w-9 shrink-0 animate-pulse rounded-lg bg-white/10" />
											<div className="h-4 flex-1 animate-pulse rounded bg-white/10" style={{ width: `${60 + (i % 3) * 15}%` }} />
										</div>
									))}
								</div>
							) : limitedChannels.length === 0 ? (
								<p className="px-4 py-8 text-center text-sm text-gray-500">No channels found</p>
							) : (
								limitedChannels.map((ch, i) => {
									const isCurrent = i === currentChannelIndex;
									const isFocused = i === focusedChannelIndex;
									return (
										<button
											key={ch.url}
											ref={(el) => { channelItemRefs.current[i] = el; }}
											type="button"
											onClick={() => switchToChannel(ch.url)}
											onMouseEnter={() => setFocusedChannelIndex(i)}
											className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors ${
												isCurrent
													? "bg-secondary-400/15 text-white"
													: isFocused
													? "bg-white/10 text-white"
													: "text-secondary-800 hover:bg-white/5 hover:text-white"
											}`}
										>
											<div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-black/60">
												{ch.icon ? (
													<img
														src={ch.icon}
														alt={ch.name}
														className="h-full w-full object-contain p-1"
														onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
													/>
												) : (
													<span className="text-xs font-black text-secondary-400">
														{getInitials(ch.name)}
													</span>
												)}
											</div>

											{ch.num !== undefined && ch.num !== null && String(ch.num) !== "" && (
												<span className="shrink-0 rounded-full bg-secondary-400/15 px-2 py-0.5 text-xs font-black text-secondary-400">
													{ch.num}
												</span>
											)}

											<span className={`flex-1 truncate text-sm font-semibold ${isCurrent ? "text-secondary-400" : ""}`}>
												{ch.name}
											</span>

											{isCurrent && (
												<span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-red-500" />
											)}
										</button>
									);
								})
							)}
						</div>

						{/* Footer */}
						<div className="shrink-0 border-t border-white/10 px-4 py-3">
							<div className="flex items-center justify-between text-xs text-gray-600">
								{hasMore ? (
									<span>Showing {guideChannelLimit} of {guideChannels.length}</span>
								) : (
									<span>{guideChannels.length} channel{guideChannels.length !== 1 ? "s" : ""}</span>
								)}
								<span>↑ ↓ · Enter · Esc</span>
							</div>
						</div>
					</DialogPanel>
				</div>
			</Dialog>

			<StreamInfoPanel
				open={isInfoOpen}
				streamUrl={streamUrl}
				onClose={() => setIsInfoOpen(false)}
			/>
		</div>
	);
}
