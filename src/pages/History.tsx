import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
	ClockIcon,
	FilmIcon,
	PlayIcon,
	TrashIcon,
	TvIcon,
	VideoCameraIcon
} from "@heroicons/react/24/outline";
import BackButton from "../components/BackButton";
import NotFound from "../components/NotFound";
import { useStreamLoader } from "../hooks/useStreamLoader";
import { historyService } from "../services/historyService";
import type { HistoryItem, HistoryType } from "../types";
import { PLACEHOLDER_POSTER } from "../constants";

type FilterKey = "all" | HistoryType;

const filters: { key: FilterKey; label: string; icon: typeof FilmIcon }[] = [
	{ key: "all", label: "All", icon: ClockIcon },
	{ key: "movie", label: "Movies", icon: FilmIcon },
	{ key: "series", label: "Series", icon: VideoCameraIcon },
	{ key: "live", label: "Live TV", icon: TvIcon }
];

const typeIcon: Record<HistoryType, typeof FilmIcon> = {
	movie: FilmIcon,
	series: VideoCameraIcon,
	live: TvIcon
};

const typeLabel: Record<HistoryType, string> = {
	movie: "movie",
	series: "series",
	live: "live"
};

function formatRelativeTime(iso: string): string {
	const then = new Date(iso).getTime();
	if (Number.isNaN(then)) return "";

	const diffMinutes = Math.floor((Date.now() - then) / 60000);
	if (diffMinutes < 1) return "Just now";
	if (diffMinutes < 60) return `${diffMinutes} min ago`;

	const diffHours = Math.floor(diffMinutes / 60);
	if (diffHours < 24) return `${diffHours} h ago`;

	const diffDays = Math.floor(diffHours / 24);
	if (diffDays < 7) return `${diffDays} d ago`;

	return new Date(iso).toLocaleDateString();
}

export default function History() {
	const { id } = useParams();
	const stream = useStreamLoader(id);
	const [items, setItems] = useState<HistoryItem[]>([]);
	const [activeFilter, setActiveFilter] = useState<FilterKey>("all");
	const [confirmingClear, setConfirmingClear] = useState(false);

	useEffect(() => {
		if (!stream) return;
		setItems(historyService.getAll(stream.id));
	}, [stream]);

	const counts = useMemo(
		() => ({
			all: items.length,
			movie: items.filter((item) => item.type === "movie").length,
			series: items.filter((item) => item.type === "series").length,
			live: items.filter((item) => item.type === "live").length
		}),
		[items]
	);

	const visibleItems = useMemo(
		() => (activeFilter === "all" ? items : items.filter((item) => item.type === activeFilter)),
		[items, activeFilter]
	);

	const removeItem = (item: HistoryItem) => {
		if (!stream) return;
		setItems(historyService.remove(stream.id, item.key));
	};

	const clearAll = () => {
		if (!stream) return;
		historyService.clear(stream.id);
		setItems([]);
		setConfirmingClear(false);
	};

	if (!stream) {
		return <NotFound message="Stream not found" />;
	}

	return (
		<div className="bg-dark text-secondary min-h-screen">
			<BackButton to={`/menu/${id}`} />
			<div className="fade-in px-6 pb-8 pt-16">
				<header className="flex flex-col gap-5 border-b border-primary/40 pb-6 md:flex-row md:items-center md:justify-between">
					<div>
						<h1 className="mt-1 flex items-center gap-2 text-3xl font-bold text-white">
							<ClockIcon className="h-7 w-7 text-secondary-400" />
							History
						</h1>
					</div>

					<div className="flex flex-wrap items-center gap-2">
						{filters.map(({ key, label, icon: Icon }) => (
							<button
								key={key}
								type="button"
								onClick={() => setActiveFilter(key)}
								className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold transition ${activeFilter === key ? "bg-secondary-400 text-dark" : "bg-primary/20 text-secondary hover:bg-primary/40"}`}
							>
								<Icon className="h-5 w-5" />
								{label}
								<span className={`rounded-full px-2 text-xs ${activeFilter === key ? "bg-dark/20" : "bg-dark/40"}`}>
									{counts[key]}
								</span>
							</button>
						))}

						{items.length > 0 && (
							confirmingClear ? (
								<span className="inline-flex items-center gap-2 rounded-lg bg-red-600/15 px-2 py-1.5 text-sm font-semibold text-red-300">
									Clear all?
									<button
										type="button"
										onClick={clearAll}
										className="rounded-md bg-red-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-red-500"
									>
										Clear
									</button>
									<button
										type="button"
										onClick={() => setConfirmingClear(false)}
										className="rounded-md bg-primary/30 px-2.5 py-1 text-xs font-bold text-secondary hover:bg-primary/50"
									>
										Cancel
									</button>
								</span>
							) : (
								<button
									type="button"
									onClick={() => setConfirmingClear(true)}
									className="inline-flex items-center gap-2 rounded-lg bg-primary/20 px-4 py-2 text-sm font-bold text-secondary transition hover:bg-red-600 hover:text-white"
								>
									<TrashIcon className="h-5 w-5" />
									Clear all
								</button>
							)
						)}
					</div>
				</header>

				{visibleItems.length === 0 ? (
					<div className="flex flex-col items-center justify-center gap-3 py-32 text-center">
						<ClockIcon className="h-16 w-16 text-primary-600" />
						<p className="text-2xl font-bold text-white">Nothing watched yet</p>
						<p className="max-w-md text-secondary-700">
							Movies, series and channels you play will appear here so you can jump back in.
						</p>
						<div className="mt-4 flex gap-3">
							<Link
								to={`/menu/${id}/tv`}
								className="rounded-lg bg-secondary-400 px-4 py-2 text-sm font-bold text-dark hover:bg-secondary"
							>
								Browse Live TV
							</Link>
							<Link
								to={`/menu/${id}/movies`}
								className="rounded-lg bg-primary/20 px-4 py-2 text-sm font-bold text-secondary hover:bg-primary/40"
							>
								Browse movies
							</Link>
						</div>
					</div>
				) : (
					<div className="grid grid-cols-2 gap-x-4 gap-y-6 py-8 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
						{visibleItems.map((item) => {
							const TypeIcon = typeIcon[item.type];
							const image = item.image || PLACEHOLDER_POSTER;
							return (
								<div key={item.key} className="group relative flex flex-col">
									<Link to={item.route} state={{ profileId: id }} className="flex flex-col focus:outline-none">
										<div className="relative aspect-video overflow-hidden rounded-xl border border-white/10 bg-black transition duration-200 group-hover:border-secondary-400/60 group-hover:shadow-lg group-hover:shadow-black/40">
											{/* Blurred fill behind a contained foreground so wide channel logos
											    and tall movie posters both look intentional in the same tile. */}
											<img
												src={image}
												alt=""
												aria-hidden="true"
												onError={(e) => { (e.currentTarget as HTMLImageElement).src = PLACEHOLDER_POSTER; }}
												className="absolute inset-0 h-full w-full scale-110 object-cover opacity-40 blur-xl"
											/>
											<img
												src={image}
												alt={item.title}
												loading="lazy"
												onError={(e) => { (e.currentTarget as HTMLImageElement).src = PLACEHOLDER_POSTER; }}
												className="relative z-10 h-full w-full object-contain p-2"
											/>

											<span className="absolute left-2 top-2 z-20 inline-flex items-center gap-1 rounded-full bg-dark/70 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-secondary-400 backdrop-blur">
												<TypeIcon className="h-3 w-3" />
												{typeLabel[item.type]}
											</span>

											<span className="absolute inset-0 z-20 flex items-center justify-center bg-black/0 transition duration-200 group-hover:bg-black/40">
												<PlayIcon className="h-10 w-10 text-white opacity-0 transition duration-200 group-hover:opacity-100" />
											</span>
										</div>

										<div className="mt-2.5 min-w-0">
											<h2 className="line-clamp-1 text-sm font-semibold text-white" title={item.title}>{item.title}</h2>
											{item.subtitle && (
												<p className="line-clamp-1 text-xs text-secondary-700">{item.subtitle}</p>
											)}
											<p className="mt-1 flex items-center gap-1 text-[11px] font-medium text-secondary-800">
												<ClockIcon className="h-3 w-3" />
												{formatRelativeTime(item.watchedAt)}
											</p>
										</div>
									</Link>

									<button
										type="button"
										onClick={() => removeItem(item)}
										title="Remove from history"
										className="invisible absolute right-2 top-2 z-30 rounded-full bg-dark/70 p-1.5 text-white opacity-0 backdrop-blur transition hover:bg-red-600 focus:visible focus:opacity-100 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"
									>
										<TrashIcon className="h-4 w-4" />
									</button>
								</div>
							);
						})}
					</div>
				)}
			</div>
		</div>
	);
}
