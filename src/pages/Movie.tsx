import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { PlayIcon } from "@heroicons/react/24/outline";
import BackButton from "../components/BackButton";
import FavouriteButton from "../components/FavouriteButton";
import DownloadButton from "../components/DownloadButton";
import NotFound from "../components/NotFound";
import StarRating from "../components/StarRating";
import { useStreamLoader } from "../hooks/useStreamLoader";
import { apiService } from "../services/apiService";
import { formatReleaseDate, getReleaseYear } from "../services/dateService";
import { generateStreamUrl } from "../services/streamService";
import { buildDownloadId } from "../services/downloadsService";
import { extractSubtitleTracks } from "../services/subtitleService";
import { buildWatchRoute } from "../services/watchRoute";
import type { DownloadStartInput, VodInfo } from "../types";
import { PLACEHOLDER_POSTER } from "../constants";

export default function Movie() {
	const { id, movieId } = useParams();
	const stream = useStreamLoader(id);
	const [movieInfo, setMovieInfo] = useState<VodInfo | null>(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		if (!stream || !movieId) return;

		const controller = new AbortController();

		const fetchMovieInfo = async () => {
			setLoading(true);
			const data = await apiService.fetchVodInfo(stream, movieId, controller.signal);

			if (!controller.signal.aborted) {
				setMovieInfo(data);
				setLoading(false);
			}
		};

		void fetchMovieInfo();

		return () => controller.abort();
	}, [movieId, stream]);

	const genres = useMemo(() => {
		const genre = movieInfo?.info?.genre;
		return genre ? genre.split(",").map((item) => item.trim()).filter(Boolean) : [];
	}, [movieInfo]);

	if (!stream) {
		return <NotFound message="Stream not found" />;
	}

	if (!movieId) {
		return <NotFound message="Movie not found" />;
	}

	if (loading) {
		return (
			<div className="relative min-h-screen bg-dark text-secondary">
				<BackButton />
				<div className="absolute inset-x-0 top-0 h-[440px] animate-pulse bg-white/5" />
				<div className="relative z-10 mx-auto max-w-5xl px-6 pb-16 pt-20">
					<div className="flex flex-col gap-8 md:flex-row md:items-end">
						<div className="h-80 w-56 flex-none animate-pulse self-center rounded-2xl bg-white/10 md:self-auto" />
						<div className="flex-1 space-y-4">
							<div className="h-12 w-3/4 animate-pulse rounded-xl bg-white/10" />
							<div className="flex gap-3">
								<div className="h-6 w-24 animate-pulse rounded-full bg-white/10" />
								<div className="h-6 w-16 animate-pulse rounded-full bg-white/10" />
								<div className="h-6 w-28 animate-pulse rounded-full bg-white/10" />
							</div>
							<div className="flex gap-2">
								<div className="h-6 w-20 animate-pulse rounded-full bg-white/10" />
								<div className="h-6 w-24 animate-pulse rounded-full bg-white/10" />
								<div className="h-6 w-16 animate-pulse rounded-full bg-white/10" />
							</div>
							<div className="flex gap-3 pt-2">
								<div className="h-12 w-36 animate-pulse rounded-xl bg-white/10" />
								<div className="h-12 w-12 animate-pulse rounded-xl bg-white/10" />
							</div>
							<div className="space-y-2 pt-3">
								<div className="h-4 w-full animate-pulse rounded bg-white/10" />
								<div className="h-4 w-full animate-pulse rounded bg-white/10" />
								<div className="h-4 w-4/5 animate-pulse rounded bg-white/10" />
								<div className="h-4 w-3/4 animate-pulse rounded bg-white/10" />
							</div>
						</div>
					</div>
				</div>
			</div>
		);
	}

	if (!movieInfo?.info) {
		return <NotFound message="Failed to load movie info" />;
	}

	const backdrop = movieInfo.info.backdrop_path;
	const backdropUrl = Array.isArray(backdrop) ? backdrop[0] ?? "" : backdrop ?? "";
	const movieName = movieInfo.info.name || "Movie";
	const releaseDate = formatReleaseDate(movieInfo.info.releasedate);
	const releaseYear = getReleaseYear(movieInfo.info.releasedate);
	const subtitles = extractSubtitleTracks(
		[
			movieInfo.subtitles,
			movieInfo.subtitle,
			movieInfo.info.subtitles,
			movieInfo.info.subtitle,
			movieInfo.movie_data?.subtitles,
			movieInfo.movie_data?.subtitle
		],
		stream.domain
	);
	const streamUrl = generateStreamUrl(
		stream.domain,
		"movie",
		stream.username,
		stream.password,
		movieId,
		movieInfo.movie_data?.container_extension || "mp4"
	);
	const watchRoute = buildWatchRoute({
		src: streamUrl,
		type: "vod",
		channel: movieName,
		category: movieInfo.info.genre,
		icon: movieInfo.info.movie_image
	});
	const downloadItem: DownloadStartInput = {
		id: buildDownloadId(stream.id, "movie", movieId),
		streamId: stream.id,
		kind: "movie",
		title: movieName,
		subtitle: movieInfo.info.genre,
		image: movieInfo.info.movie_image || movieInfo.info.cover_big,
		url: streamUrl,
		container: movieInfo.movie_data?.container_extension || "mp4",
		route: `/menu/${id}/movies/v/${movieId}`,
		subtitles: subtitles.map((track) => ({
			language: track.language,
			label: track.label,
			url: track.src
		}))
	};
	const favouriteItem = {
		id: movieId,
		streamId: stream.id,
		type: "movie" as const,
		title: movieName,
		image: movieInfo.info.movie_image || movieInfo.info.cover_big,
		subtitle: movieInfo.info.genre,
		route: `/menu/${id}/movies/v/${movieId}`
	};

	return (
		<div className="relative min-h-screen bg-dark text-secondary">
			{/* Cinematic backdrop */}
			<div className="absolute inset-x-0 top-0 h-[440px] overflow-hidden">
				{backdropUrl && (
					<img src={backdropUrl} alt="" className="h-full w-full object-cover object-top" />
				)}
				<div className="absolute inset-0 bg-gradient-to-t from-dark via-dark/75 to-dark/30" />
				<div className="absolute inset-0 bg-gradient-to-r from-dark/90 via-dark/40 to-transparent" />
			</div>

			<BackButton />

			<div className="fade-in relative z-10 mx-auto max-w-5xl px-6 pb-16 pt-20">
				<div className="flex flex-col gap-8 md:flex-row md:items-end">
					<img
						src={movieInfo.info.cover_big || PLACEHOLDER_POSTER}
						alt={movieName}
						className="w-56 flex-none self-center rounded-2xl border border-white/10 shadow-2xl shadow-black/60 md:self-auto"
					/>

					<div className="flex-1">
						<h1 className="text-4xl font-bold leading-tight text-white md:text-5xl">{movieName}</h1>

						<div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
							<StarRating value={movieInfo.info.rating} scale={10} size="md" showValue />
							{releaseYear && (
								<span className="rounded-full bg-white/10 px-3 py-1 font-semibold text-secondary-800">{releaseYear}</span>
							)}
							{releaseDate && (
								<span className="text-secondary-700">Released {releaseDate}</span>
							)}
						</div>

						{genres.length > 0 && (
							<div className="mt-4 flex flex-wrap gap-2">
								{genres.map((genre) => (
									<span key={genre} className="rounded-full bg-secondary-400/15 px-3 py-1 text-xs font-semibold text-secondary-400">
										{genre}
									</span>
								))}
							</div>
						)}

						<div className="mt-6 flex flex-wrap items-center gap-3">
							<Link
								to={watchRoute}
								state={{ subtitles, backTo: `/menu/${id}/movies/v/${movieId}`, backLabel: movieName }}
								className="inline-flex items-center gap-2 rounded-xl bg-secondary-400 px-7 py-3 text-base font-bold text-dark shadow-lg shadow-secondary-400/30 transition hover:scale-105 hover:bg-secondary"
							>
								<PlayIcon className="h-5 w-5" />
								Watch Now
							</Link>
							<FavouriteButton item={favouriteItem} />
							<DownloadButton item={downloadItem} />
						</div>

						{movieInfo.info.plot && (
							<p className="mt-7 max-w-2xl leading-relaxed text-secondary-800">{movieInfo.info.plot}</p>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
