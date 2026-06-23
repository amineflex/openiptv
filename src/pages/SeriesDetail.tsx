import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";
import FavouriteButton from "../components/FavouriteButton";
import LoadingSpinner from "../components/LoadingSpinner";
import NotFound from "../components/NotFound";
import { useStreamLoader } from "../hooks/useStreamLoader";
import { apiService } from "../services/apiService";
import { generateStreamUrl } from "../services/streamService";
import { extractSubtitleTracks } from "../services/subtitleService";
import { buildWatchRoute } from "../services/watchRoute";
import  StarRating  from "../components/StarRating";
import type { SeriesEpisode, SeriesInfo, SubtitleTrack, WatchNextEpisode } from "../types";

const placeholderPoster = "https://popcornusa.s3.amazonaws.com/placeholder-movieimage.png";

function getEpisodeTitle(episode: SeriesEpisode): string {
	const prefix = episode.episode_num ? `Episode ${episode.episode_num}` : "Episode";
	return episode.title ? `${prefix} - ${episode.title}` : prefix;
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
	const stream = useStreamLoader(id);
	const [seriesInfo, setSeriesInfo] = useState<SeriesInfo | null>(null);
	const [loading, setLoading] = useState(true);

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

	if (!stream) {
		return <NotFound message="Stream not found" />;
	}

	if (!seriesId) {
		return <NotFound message="Series not found" />;
	}

	if (loading) {
		return (
			<div className="bg-dark text-secondary min-h-screen">
				<LoadingSpinner />
			</div>
		);
	}

	if (!seriesInfo?.info) {
		return <NotFound message="Failed to load series info" />;
	}

	const title = seriesInfo.info.name || "Series";
	const favouriteItem = {
		id: seriesId,
		type: "series" as const,
		title,
		image: seriesInfo.info.cover,
		subtitle: seriesInfo.info.genre,
		route: `/menu/${id}/series/v/${seriesId}`
	};
	const orderedEpisodes = seasons.flatMap(([, episodes]) =>
		[...episodes].sort((a, b) => Number(a.episode_num ?? 0) - Number(b.episode_num ?? 0))
	);
	const watchItems = orderedEpisodes.map((episode) => {
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
			channel: getEpisodeTitle(episode),
			category: title,
			icon: episode.info?.movie_image || seriesInfo.info?.cover
		});

		return {
			episode,
			streamUrl,
			route,
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
		<div className="bg-dark text-secondary min-h-screen">
			<div className="container mx-auto px-4 py-8">
				<header className="flex flex-row items-start gap-6 mb-8">
					<img
						src={seriesInfo.info.cover || placeholderPoster}
						alt={title}
						className="w-48 rounded-lg shadow-lg"
					/>
					<div className="flex-1">
						<Link
							to={`/menu/${id}/series`}
							className="inline-flex text-secondary/75 text-sm font-semibold items-center rounded-full bg-primary/10 hover:bg-primary-100 p-2 mb-4"
						>
							<ArrowLeftIcon className="h-5 w-5 text-secondary-400" />
						</Link>
						<div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
							<h1 className="text-4xl font-bold text-white">{title}</h1>
							<FavouriteButton item={favouriteItem} />
						</div>
						<p className="text-lg text-secondary-800 mb-4">{seriesInfo.info.plot}</p>
						<div className="flex flex-wrap gap-2 text-sm">
							{seriesInfo.info.genre && (
								<span className="bg-secondary-400/25 text-secondary-400 py-1 px-2 rounded-xl">
									{seriesInfo.info.genre}
								</span>
							)}
							{seriesInfo.info.rating && (
								<StarRating value={seriesInfo.info.rating} scale={10} />
							)}
							{(seriesInfo.info.releaseDate || seriesInfo.info.releasedate) && (
								<span>Release: {seriesInfo.info.releaseDate || seriesInfo.info.releasedate}</span>
							)}
						</div>
					</div>
				</header>

				<div className="space-y-8">
					{seasons.map(([season, episodes]) => (
						<section key={season}>
							<h2 className="text-2xl font-bold mb-4">Season {season}</h2>
							<div className="grid md:grid-cols-2 grid-cols-1 gap-4">
								{episodes.map((episode) => {
									const watchItem = watchItemByEpisodeId[String(episode.id)];
									if (!watchItem) return null;

									return (
										<Link
											key={episode.id}
											to={watchItem.route}
											state={{
												subtitles: watchItem.subtitles,
												nextEpisode: nextByEpisodeId[String(episode.id)]
											}}
											className="flex gap-4 bg-primary/10 hover:bg-primary/20 rounded-xl p-4 border-2 border-transparent hover:border-secondary-400 duration-150"
										>
											<img
												src={episode.info?.movie_image || seriesInfo.info?.cover || placeholderPoster}
												alt={getEpisodeTitle(episode)}
												className="w-28 h-16 object-cover rounded-lg bg-black"
											/>
											<div>
												<h3 className="text-lg font-semibold text-white">{getEpisodeTitle(episode)}</h3>
												<p className="text-sm text-secondary-800 line-clamp-2">{episode.info?.plot}</p>
											</div>
										</Link>
									);
								})}
							</div>
						</section>
					))}
				</div>
			</div>
		</div>
	);
}
