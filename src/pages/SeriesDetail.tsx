import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeftIcon, CalendarDaysIcon, PlayCircleIcon, QueueListIcon } from "@heroicons/react/24/outline";
import FavouriteButton from "../components/FavouriteButton";
import DownloadButton from "../components/DownloadButton";
import NotFound from "../components/NotFound";
import StarRating from "../components/StarRating";
import { useStreamLoader } from "../hooks/useStreamLoader";
import { apiService } from "../services/apiService";
import { formatReleaseDate } from "../services/dateService";
import { generateStreamUrl } from "../services/streamService";
import { buildDownloadId } from "../services/downloadsService";
import { extractSubtitleTracks } from "../services/subtitleService";
import { buildWatchRoute } from "../services/watchRoute";
import type { DownloadStartInput, SeriesEpisode, SeriesInfo, SubtitleTrack, WatchNextEpisode } from "../types";
import { PLACEHOLDER_POSTER } from "../constants";

function getEpisodeTitle(episode: SeriesEpisode): string {
	const prefix = episode.episode_num ? `Episode ${episode.episode_num}` : "Episode";
	return episode.title ? `${prefix} - ${episode.title}` : prefix;
}

function getEpisodeWindowTitle(seriesTitle: string, season: string, episode: SeriesEpisode): string {
	const episodeLabel = episode.episode_num ? `Episode ${episode.episode_num}` : "Episode";
	return `${seriesTitle} Saison ${season} ${episodeLabel}`;
}

function getEpisodeSubtitles(episode: SeriesEpisode, domain: string): SubtitleTrack[] {
	return extractSubtitleTracks(
		[
			episode.subtitles,
			episode.subtitle,
			episode.info?.subtitles,
			episode.info?.subtitle
		],
		domain
	);
}

export default function SeriesDetail() {
	const { id, seriesId } = useParams();
	const navigate = useNavigate();
	const stream = useStreamLoader(id);
	const [seriesInfo, setSeriesInfo] = useState<SeriesInfo | null>(null);
	const [loading, setLoading] = useState(true);
	const [selectedSeason, setSelectedSeason] = useState("");

	useEffect(() => {
		if (!stream || !seriesId) return;

		const controller = new AbortController();

		const fetchSeriesInfo = async () => {
			setLoading(true);
			const data = await apiService.fetchSeriesInfo(stream, seriesId, controller.signal);

			if (!controller.signal.aborted) {
				setSeriesInfo(data);
				setLoading(false);
			}
		};

		void fetchSeriesInfo();

		return () => controller.abort();
	}, [seriesId, stream]);

	const seasons = useMemo(() => {
		const entries = Object.entries(seriesInfo?.episodes ?? {});
		return entries.sort(([a], [b]) => Number(a) - Number(b));
	}, [seriesInfo]);

	useEffect(() => {
		if (seasons.length === 0) {
			setSelectedSeason("");
			return;
		}

		setSelectedSeason((current) =>
			seasons.some(([season]) => season === current) ? current : seasons[0][0]
		);
	}, [seasons]);

	if (!stream) {
		return <NotFound message="Stream not found" />;
	}

	if (!seriesId) {
		return <NotFound message="Series not found" />;
	}

	if (loading) {
		return (
			<div className="relative min-h-screen bg-dark text-secondary">
				<div className="absolute inset-x-0 top-0 h-[420px] animate-pulse bg-white/5" />
				<div className="relative z-10 px-6 py-5">
					<div className="h-10 w-10 animate-pulse rounded-full bg-white/10" />
				</div>
				<main className="relative z-10 mx-auto max-w-6xl px-6 pb-16 pt-12">
					<div className="flex flex-col gap-8 md:flex-row md:items-end">
						<div className="h-80 w-56 flex-none animate-pulse self-center rounded-2xl bg-white/10 md:self-auto" />
						<div className="flex-1 space-y-4">
							<div className="h-7 w-24 animate-pulse rounded-full bg-white/10" />
							<div className="h-12 w-2/3 animate-pulse rounded-xl bg-white/10" />
							<div className="flex flex-wrap gap-3">
								<div className="h-6 w-20 animate-pulse rounded-full bg-white/10" />
								<div className="h-6 w-36 animate-pulse rounded-full bg-white/10" />
								<div className="h-6 w-32 animate-pulse rounded-full bg-white/10" />
							</div>
							<div className="flex gap-2">
								<div className="h-6 w-16 animate-pulse rounded-full bg-white/10" />
								<div className="h-6 w-20 animate-pulse rounded-full bg-white/10" />
								<div className="h-6 w-14 animate-pulse rounded-full bg-white/10" />
							</div>
							<div className="space-y-2 pt-3">
								<div className="h-4 w-full animate-pulse rounded bg-white/10" />
								<div className="h-4 w-full animate-pulse rounded bg-white/10" />
								<div className="h-4 w-3/4 animate-pulse rounded bg-white/10" />
							</div>
						</div>
					</div>

					<div className="mt-12">
						<div className="mb-5 flex flex-col gap-4 border-b border-white/10 pb-5 md:flex-row md:items-end md:justify-between">
							<div className="space-y-2">
								<div className="h-8 w-32 animate-pulse rounded bg-white/10" />
								<div className="h-4 w-40 animate-pulse rounded bg-white/10" />
							</div>
							<div className="h-12 w-64 animate-pulse rounded-xl bg-white/10" />
						</div>
						<div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
							{Array.from({ length: 6 }).map((_, i) => (
								<div key={i} className="flex gap-4 rounded-xl border border-white/10 bg-primary/10 p-3">
									<div className="h-28 w-40 flex-none animate-pulse rounded-lg bg-white/10" />
									<div className="flex-1 space-y-2 py-1">
										<div className="h-5 w-24 animate-pulse rounded-full bg-white/10" />
										<div className="h-6 w-3/4 animate-pulse rounded bg-white/10" />
										<div className="h-4 w-full animate-pulse rounded bg-white/10" />
										<div className="h-4 w-4/5 animate-pulse rounded bg-white/10" />
									</div>
								</div>
							))}
						</div>
					</div>
				</main>
			</div>
		);
	}

	if (!seriesInfo?.info) {
		return <NotFound message="Failed to load series info" />;
	}

	const title = seriesInfo.info.name || "Series";
	const releaseValue = seriesInfo.info.releaseDate || seriesInfo.info.releasedate;
	const releaseDate = formatReleaseDate(releaseValue);
	const favouriteItem = {
		id: seriesId,
		streamId: stream.id,
		type: "series" as const,
		title,
		image: seriesInfo.info.cover,
		subtitle: seriesInfo.info.genre,
		route: `/menu/${id}/series/v/${seriesId}`
	};
	const orderedEpisodes = seasons.flatMap(([, episodes]) =>
		[...episodes].sort((a, b) => Number(a.episode_num ?? 0) - Number(b.episode_num ?? 0))
	);
	const activeSeasonEntry = seasons.find(([season]) => season === selectedSeason) ?? seasons[0];
	const activeSeason = activeSeasonEntry?.[0] ?? "";
	const activeEpisodes = [...(activeSeasonEntry?.[1] ?? [])].sort(
		(a, b) => Number(a.episode_num ?? 0) - Number(b.episode_num ?? 0)
	);
	const episodeSeasonById = seasons.reduce<Record<string, string>>((seasonMap, [season, episodes]) => {
		for (const episode of episodes) {
			seasonMap[String(episode.id)] = season;
		}
		return seasonMap;
	}, {});
	const watchItems = orderedEpisodes.map((episode) => {
		const season = episodeSeasonById[String(episode.id)] ?? "";
		const streamUrl = generateStreamUrl(
			stream.domain,
			"series",
			stream.username,
			stream.password,
			episode.id,
			episode.container_extension || "mp4"
		);
		const route = buildWatchRoute({
			src: streamUrl,
			type: "vod",
			channel: getEpisodeWindowTitle(title, season, episode),
			category: title,
			icon: episode.info?.movie_image || seriesInfo.info?.cover
		});
		const downloadItem: DownloadStartInput = {
			id: buildDownloadId(stream.id, "episode", episode.id),
			streamId: stream.id,
			kind: "episode",
			title: episode.title || getEpisodeTitle(episode),
			subtitle: `${title} · S${season || "?"}E${episode.episode_num ?? "?"}`,
			image: episode.info?.movie_image || seriesInfo.info?.cover,
			url: streamUrl,
			container: episode.container_extension || "mp4",
			seriesId,
			seriesTitle: title,
			season,
			episodeNum: episode.episode_num,
			route: `/menu/${id}/series/v/${seriesId}`,
			subtitles: getEpisodeSubtitles(episode, stream.domain).map((track) => ({
				language: track.language,
				label: track.label,
				url: track.src
			}))
		};

		return {
			episode,
			streamUrl,
			route,
			downloadItem,
			subtitles: getEpisodeSubtitles(episode, stream.domain)
		};
	});
	const watchItemByEpisodeId = watchItems.reduce<Record<string, (typeof watchItems)[number]>>((itemMap, item) => {
		itemMap[String(item.episode.id)] = item;
		return itemMap;
	}, {});

	const nextByEpisodeId = watchItems.reduceRight<Record<string, WatchNextEpisode>>((nextMap, item, index) => {
		const nextItem = watchItems[index + 1];
		if (!nextItem) return nextMap;

		nextMap[String(item.episode.id)] = {
			title: getEpisodeTitle(nextItem.episode),
			route: nextItem.route,
			image: nextItem.episode.info?.movie_image || seriesInfo.info?.cover,
			subtitles: nextItem.subtitles,
			nextEpisode: nextMap[String(nextItem.episode.id)]
		};
		return nextMap;
	}, {});

	return (
		<div className="relative min-h-screen bg-dark text-secondary">
			<div className="absolute inset-x-0 top-0 h-[420px] overflow-hidden">
				<img
					src={seriesInfo.info.cover || PLACEHOLDER_POSTER}
					alt=""
					className="h-full w-full scale-110 object-cover object-top opacity-35 blur-sm"
				/>
				<div className="absolute inset-0 bg-gradient-to-t from-dark via-dark/85 to-dark/40" />
				<div className="absolute inset-0 bg-gradient-to-r from-dark via-dark/70 to-transparent" />
			</div>

			<div className="relative z-10 px-6 py-5">
				<button
					type="button"
					onClick={() => navigate(-1)}
					className="inline-flex rounded-full bg-dark/55 p-2.5 text-secondary-400 backdrop-blur transition hover:bg-secondary-400 hover:text-dark"
					aria-label="Back"
				>
					<ArrowLeftIcon className="h-5 w-5" />
				</button>
			</div>

			<main className="fade-in relative z-10 mx-auto max-w-6xl px-6 pb-16 pt-12">
				<header className="flex flex-col gap-8 md:flex-row md:items-end">
					<img
						src={seriesInfo.info.cover || PLACEHOLDER_POSTER}
						alt={title}
						className="w-56 flex-none self-center rounded-2xl border border-white/10 object-cover shadow-2xl shadow-black/60 md:self-auto"
					/>

					<div className="flex-1">
						<div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
							<div>
								<div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
									<span className="rounded-full bg-secondary-400/15 px-3 py-1 font-bold text-secondary-400">Series</span>
								</div>
								<h1 className="text-4xl font-bold leading-tight text-white md:text-5xl">{title}</h1>
							</div>
							<FavouriteButton item={favouriteItem} />
						</div>

						<div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
							<StarRating value={seriesInfo.info.rating} scale={10} size="md"  />
							{releaseDate && (
								<span className="inline-flex items-center gap-1.5 text-secondary-700">
									<CalendarDaysIcon className="h-4 w-4 text-secondary-400" />
									Released {releaseDate}
								</span>
							)}
							<span className="inline-flex items-center gap-1.5 text-secondary-700">
								<QueueListIcon className="h-4 w-4 text-secondary-400" />
								{seasons.length} season{seasons.length !== 1 ? "s" : ""} - {orderedEpisodes.length} episode{orderedEpisodes.length !== 1 ? "s" : ""}
							</span>
						</div>

						{seriesInfo.info.genre && (
							<div className="mt-4 flex flex-wrap gap-2">
								{seriesInfo.info.genre.split(",").map((genre) => {
									const label = genre.trim();
									if (!label) return null;

									return (
										<span key={label} className="rounded-full bg-secondary-400/15 px-3 py-1 text-xs font-semibold text-secondary-400">
											{label}
										</span>
									);
								})}
							</div>
						)}

						{seriesInfo.info.plot && (
							<p className="mt-7 max-w-3xl leading-relaxed text-secondary-800">{seriesInfo.info.plot}</p>
						)}
					</div>
				</header>

				<section className="mt-12">
					<div className="mb-5 flex flex-col gap-4 border-b border-white/10 pb-5 md:flex-row md:items-end md:justify-between">
						<div>
							<h2 className="text-2xl font-bold text-white">Episodes</h2>
							<p className="mt-1 text-sm text-secondary-700">
								Season {activeSeason || "-"} - {activeEpisodes.length} episode{activeEpisodes.length !== 1 ? "s" : ""}
							</p>
						</div>

						<label className="flex w-full flex-col gap-2 md:w-64">
							<span className="text-xs font-bold uppercase tracking-wide text-secondary-700">Season</span>
							<select
								value={activeSeason}
								onChange={(event) => setSelectedSeason(event.target.value)}
								className="rounded-xl border border-white/10 bg-primary/20 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-black/20 outline-none transition hover:border-secondary-400/50 focus:border-secondary-400"
							>
								{seasons.map(([season, episodes]) => (
									<option key={season} value={season} className="bg-dark text-white">
										Season {season} - {episodes.length} episodes
									</option>
								))}
							</select>
						</label>
					</div>

					<div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
						{activeEpisodes.map((episode) => {
							const watchItem = watchItemByEpisodeId[String(episode.id)];
							if (!watchItem) return null;

							const episodeDate = formatReleaseDate(episode.info?.releasedate);

							return (
								<div key={episode.id} className="relative">
									<Link
										to={watchItem.route}
										state={{
											subtitles: watchItem.subtitles,
											nextEpisode: nextByEpisodeId[String(episode.id)],
											backTo: `/menu/${id}/series/v/${seriesId}`,
											backLabel: title
										}}
										className="group flex min-h-[132px] gap-4 rounded-xl border border-white/10 bg-primary/10 p-3 transition duration-200 hover:-translate-y-0.5 hover:border-secondary-400/70 hover:bg-primary/20 hover:shadow-xl hover:shadow-secondary-400/10"
									>
										<div className="relative h-28 w-40 flex-none overflow-hidden rounded-lg bg-black">
											<img
												src={episode.info?.movie_image || seriesInfo.info?.cover || PLACEHOLDER_POSTER}
												alt={getEpisodeTitle(episode)}
												loading="lazy"
												className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
											/>
											<div className="absolute inset-0 flex items-center justify-center bg-black/25 opacity-0 transition group-hover:opacity-100">
												<PlayCircleIcon className="h-11 w-11 text-secondary-400" />
											</div>
										</div>

										<div className="min-w-0 flex-1 py-1">
											<div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-secondary-700">
												<span className="rounded-full bg-secondary-400/15 px-2 py-0.5 font-bold text-secondary-400">
												Episode {episode.episode_num || "-"}
												</span>
												{episodeDate && <span>{episodeDate}</span>}
												{episode.info?.duration && <span>{episode.info.duration}</span>}
											</div>
											<h3 className="line-clamp-2 text-lg font-bold text-white">{episode.title || getEpisodeTitle(episode)}</h3>
											{episode.info?.plot && (
												<p className="mt-2 line-clamp-2 text-sm leading-relaxed text-secondary-800">{episode.info.plot}</p>
											)}
										</div>
									</Link>
									<div className="absolute right-2 top-2 z-10">
										<DownloadButton item={watchItem.downloadItem} variant="compact" />
									</div>
								</div>
							);
						})}
					</div>
				</section>
			</main>
		</div>
	);
}
