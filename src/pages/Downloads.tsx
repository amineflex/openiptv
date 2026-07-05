import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
	ArrowDownTrayIcon,
	ArrowPathIcon,
	ExclamationTriangleIcon,
	FilmIcon,
	FolderOpenIcon,
	PlayIcon,
	TrashIcon,
	VideoCameraIcon,
	XMarkIcon
} from "@heroicons/react/24/outline";
import BackButton from "../components/BackButton";
import NotFound from "../components/NotFound";
import SearchBar from "../components/SearchBar";
import { useStreamLoader } from "../hooks/useStreamLoader";
import { useSearch } from "../hooks/useSearch";
import { useDownloads } from "../hooks/useDownloads";
import { formatBytes, formatSpeed, recordToStartInput } from "../services/downloadsService";
import { buildWatchRoute } from "../services/watchRoute";
import type { DownloadRecord } from "../types";
import { PLACEHOLDER_POSTER } from "../constants";

// Rows are tall; cap the page so the list never grows into an endless scroll.
const PER_PAGE = 12;

function statusLabel(record: DownloadRecord): string {
	switch (record.status) {
		case "completed":
			return `Downloaded · ${formatBytes(record.total || record.received)}`;
		case "downloading":
			return record.total > 0
				? `${formatBytes(record.received)} / ${formatBytes(record.total)}`
				: formatBytes(record.received);
		case "queued":
			return "Starting…";
		case "error":
			return record.error ? `Failed · ${record.error}` : "Failed";
		case "canceled":
			return "Canceled";
		default:
			return "";
	}
}

interface RowProps {
	record: DownloadRecord;
	speed?: number;
	onPlay: () => void;
	onCancel: () => void;
	onRetry: () => void;
	onReveal: () => void;
	onDelete: () => void;
}

function DownloadRow({ record, speed, onPlay, onCancel, onRetry, onReveal, onDelete }: RowProps) {
	const isActive = record.status === "downloading" || record.status === "queued";
	const isDone = record.status === "completed";
	const isFailed = record.status === "error" || record.status === "canceled";
	const percent = record.total > 0 ? Math.min(100, (record.received / record.total) * 100) : -1;

	return (
		<div className="flex items-center gap-4 rounded-xl border border-white/10 bg-primary/10 p-3 transition hover:border-white/20">
			<button
				type="button"
				onClick={isDone ? onPlay : undefined}
				disabled={!isDone}
				className="relative h-16 w-28 flex-none overflow-hidden rounded-lg bg-black disabled:cursor-default"
			>
				<img
					src={record.image || PLACEHOLDER_POSTER}
					alt=""
					loading="lazy"
					className="h-full w-full object-cover"
				/>
				{isDone && (
					<span className="absolute inset-0 flex items-center justify-center bg-black/35 opacity-0 transition hover:opacity-100">
						<PlayIcon className="h-7 w-7 text-white" />
					</span>
				)}
			</button>

			<div className="min-w-0 flex-1">
				<h3 className="truncate font-bold text-white">{record.title}</h3>
				{record.subtitle && <p className="truncate text-sm text-secondary-700">{record.subtitle}</p>}

				<div className="mt-2 flex items-center gap-2">
					<span
						className={`text-xs font-semibold ${
							isDone ? "text-emerald-300" : isFailed ? "text-red-300" : "text-secondary-700"
						}`}
					>
						{statusLabel(record)}
					</span>
					{record.status === "downloading" && speed ? (
						<span className="text-xs text-secondary-800">· {formatSpeed(speed)}</span>
					) : null}
					{record.subtitles && record.subtitles.length > 0 && (
						<span
							title={`${record.subtitles.length} subtitle(s) downloaded`}
							className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold text-secondary-700"
						>
							CC {record.subtitles.length}
						</span>
					)}
				</div>

				{isActive && (
					<div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
						<div
							className={`h-full rounded-full bg-secondary-400 ${percent < 0 ? "w-1/3 animate-pulse" : "transition-all"}`}
							style={percent >= 0 ? { width: `${percent}%` } : undefined}
						/>
					</div>
				)}
			</div>

			<div className="flex flex-none items-center gap-1.5">
				{isDone && (
					<button
						type="button"
						onClick={onPlay}
						title="Play in app"
						className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/90 px-3 py-2 text-sm font-bold text-white transition hover:bg-emerald-400"
					>
						<PlayIcon className="h-4 w-4" />
						Play
					</button>
				)}
				{isActive && (
					<button
						type="button"
						onClick={onCancel}
						title="Cancel"
						className="rounded-full bg-dark/60 p-2 text-secondary hover:bg-red-600 hover:text-white"
					>
						<XMarkIcon className="h-5 w-5" />
					</button>
				)}
				{isFailed && (
					<button
						type="button"
						onClick={onRetry}
						title="Retry"
						className="rounded-full bg-dark/60 p-2 text-secondary hover:bg-secondary-400 hover:text-dark"
					>
						<ArrowPathIcon className="h-5 w-5" />
					</button>
				)}
				<button
					type="button"
					onClick={onReveal}
					title="Open folder"
					className="rounded-full bg-dark/60 p-2 text-secondary hover:bg-secondary-400 hover:text-dark"
				>
					<FolderOpenIcon className="h-5 w-5" />
				</button>
				<button
					type="button"
					onClick={onDelete}
					title="Delete"
					className="rounded-full bg-dark/60 p-2 text-secondary hover:bg-red-600 hover:text-white"
				>
					<TrashIcon className="h-5 w-5" />
				</button>
			</div>
		</div>
	);
}

export default function Downloads() {
	const { id } = useParams();
	const navigate = useNavigate();
	const stream = useStreamLoader(id);
	const { records, speeds, loading, available, start, cancel, remove, playback, openFile, reveal, openFolder } =
		useDownloads();
	const [page, setPage] = useState(0);

	const mine = useMemo(
		() =>
			Object.values(records)
				.filter((record) => !stream || record.streamId === stream.id)
				.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
		[records, stream]
	);

	const searchFields = useMemo(
		() => [
			{ getValue: (record: DownloadRecord) => record.title, weight: 3 },
			{ getValue: (record: DownloadRecord) => record.seriesTitle, weight: 2 },
			{ getValue: (record: DownloadRecord) => record.subtitle }
		],
		[]
	);
	const { query, results: searched, setQuery, clearSearch } = useSearch({ items: mine, fields: searchFields });

	const pageCount = Math.max(1, Math.ceil(searched.length / PER_PAGE));

	// Keep the page in range as the list shrinks (search, deletes) — and snap back
	// to the first page whenever the query changes.
	useEffect(() => {
		setPage(0);
	}, [query]);
	useEffect(() => {
		setPage((current) => Math.min(current, pageCount - 1));
	}, [pageCount]);

	const pageItems = useMemo(
		() => searched.slice(page * PER_PAGE, (page + 1) * PER_PAGE),
		[searched, page]
	);

	const movies = useMemo(() => pageItems.filter((record) => record.kind === "movie"), [pageItems]);

	// Group the current page's episodes by series, ordered by season + episode.
	const seriesGroups = useMemo(() => {
		const groups = new Map<string, { title: string; episodes: DownloadRecord[] }>();
		for (const record of pageItems) {
			if (record.kind !== "episode") continue;
			const key = record.seriesId || record.seriesTitle || "series";
			const group = groups.get(key) ?? { title: record.seriesTitle || "Series", episodes: [] };
			group.episodes.push(record);
			groups.set(key, group);
		}
		for (const group of groups.values()) {
			group.episodes.sort(
				(a, b) =>
					Number(a.season ?? 0) - Number(b.season ?? 0) ||
					Number(a.episodeNum ?? 0) - Number(b.episodeNum ?? 0)
			);
		}
		return [...groups.values()];
	}, [pageItems]);

	if (!stream) {
		return <NotFound message="Stream not found" />;
	}

	// Play a finished download inside the app's own player: resolve it to a
	// localhost URL (+ subtitle sidecars) and hand it to the normal Watch route.
	const playLocal = async (record: DownloadRecord) => {
		const result = await playback(record.id);
		if (result.ok && result.url) {
			navigate(
				buildWatchRoute({
					src: result.url,
					type: "vod",
					channel: record.title,
					category: record.subtitle,
					icon: record.image
				}),
				{
					state: {
						subtitles: result.subtitles ?? [],
						backTo: record.route ?? `/menu/${id}/downloads`,
						backLabel: record.title,
						profileId: id
					}
				}
			);
		} else {
			// Server hiccup — fall back to the OS default player.
			void openFile(record.id);
		}
	};

	const rowHandlers = (record: DownloadRecord): RowProps => ({
		record,
		speed: speeds[record.id],
		onPlay: () => void playLocal(record),
		onCancel: () => void cancel(record.id),
		onRetry: () => void start(recordToStartInput(record)),
		onReveal: () => void reveal(record.id),
		onDelete: () => void remove(record.id)
	});

	const isEmpty = !loading && mine.length === 0;

	return (
		<div className="min-h-screen bg-dark text-secondary">
			<BackButton to={`/menu/${id}`} />
			<div className="fade-in px-6 pb-8 pt-16">
				<header className="flex flex-col gap-5 border-b border-primary/40 pb-6 md:flex-row md:items-center md:justify-between">
					<div>
						<h1 className="mt-1 flex items-center gap-2 text-3xl font-bold text-white">
							<ArrowDownTrayIcon className="h-7 w-7 text-secondary-400" />
							Downloads
						</h1>
					</div>

					<button
						type="button"
						onClick={() => void openFolder()}
						className="inline-flex items-center gap-2 self-start rounded-lg bg-primary/20 px-4 py-2 text-sm font-bold text-secondary transition hover:bg-secondary-400 hover:text-dark md:self-auto"
					>
						<FolderOpenIcon className="h-5 w-5" />
						Open folder
					</button>
				</header>

				{!available ? (
					<div className="flex flex-col items-center justify-center gap-3 py-32 text-center">
						<ExclamationTriangleIcon className="h-16 w-16 text-primary-600" />
						<p className="text-2xl font-bold text-white">Downloads unavailable</p>
						<p className="max-w-md text-secondary-700">
							Downloading requires the desktop app. Open OpenIPTV as an installed app to save
							movies and episodes offline.
						</p>
					</div>
				) : isEmpty ? (
					<div className="flex flex-col items-center justify-center gap-3 py-32 text-center">
						<ArrowDownTrayIcon className="h-16 w-16 text-primary-600" />
						<p className="text-2xl font-bold text-white">No downloads yet</p>
						<p className="max-w-md text-secondary-700">
							Hit the download button on any movie or episode to keep it offline. Files are saved
							in your app data folder.
						</p>
						<div className="mt-4 flex gap-3">
							<Link
								to={`/menu/${id}/movies`}
								className="rounded-lg bg-secondary-400 px-4 py-2 text-sm font-bold text-dark hover:bg-secondary"
							>
								Browse movies
							</Link>
							<Link
								to={`/menu/${id}/series`}
								className="rounded-lg bg-primary/20 px-4 py-2 text-sm font-bold text-secondary hover:bg-primary/40"
							>
								Browse series
							</Link>
						</div>
					</div>
				) : (
					<div className="py-8">
						<SearchBar
							value={query}
							onChange={setQuery}
							onClear={clearSearch}
							placeholder="Search downloads"
							resultCount={searched.length}
							totalCount={mine.length}
						/>

						{searched.length === 0 ? (
							<p className="py-20 text-center text-secondary-700">No downloads match “{query}”.</p>
						) : (
							<div className="space-y-10">
								{movies.length > 0 && (
									<section>
										<h2 className="mb-4 flex items-center gap-2 text-xl font-bold text-white">
											<FilmIcon className="h-6 w-6 text-secondary-400" />
											Movies
											<span className="rounded-full bg-primary/30 px-2 text-sm text-secondary-700">
												{movies.length}
											</span>
										</h2>
										<div className="space-y-3">
											{movies.map((record) => (
												<DownloadRow key={record.id} {...rowHandlers(record)} />
											))}
										</div>
									</section>
								)}

								{seriesGroups.map((group) => (
									<section key={group.title}>
										<h2 className="mb-4 flex items-center gap-2 text-xl font-bold text-white">
											<VideoCameraIcon className="h-6 w-6 text-secondary-400" />
											{group.title}
											<span className="rounded-full bg-primary/30 px-2 text-sm text-secondary-700">
												{group.episodes.length}
											</span>
										</h2>
										<div className="space-y-3">
											{group.episodes.map((record) => (
												<DownloadRow key={record.id} {...rowHandlers(record)} />
											))}
										</div>
									</section>
								))}
							</div>
						)}

						{pageCount > 1 && (
							<div className="mt-10 flex items-center justify-center gap-3">
								<button
									type="button"
									onClick={() => setPage((p) => Math.max(0, p - 1))}
									disabled={page === 0}
									className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 font-semibold text-secondary transition hover:border-secondary-400/50 hover:text-secondary-400 disabled:cursor-not-allowed disabled:opacity-30"
								>
									&#8592; Prev
								</button>
								<span className="rounded-lg bg-white/5 px-3 py-2 text-sm text-secondary-700">
									Page <span className="font-bold text-white">{page + 1}</span> / {pageCount}
								</span>
								<button
									type="button"
									onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
									disabled={page >= pageCount - 1}
									className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 font-semibold text-secondary transition hover:border-secondary-400/50 hover:text-secondary-400 disabled:cursor-not-allowed disabled:opacity-30"
								>
									Next &#8594;
								</button>
							</div>
						)}
					</div>
				)}
			</div>
		</div>
	);
}
