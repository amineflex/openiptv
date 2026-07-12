import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
	FilmIcon,
	HeartIcon,
	TrashIcon,
	VideoCameraIcon
} from "@heroicons/react/24/outline";
import { HeartIcon as HeartSolidIcon } from "@heroicons/react/24/solid";
import BackButton from "../components/BackButton";
import NotFound from "../components/NotFound";
import PosterCard from "../components/PosterCard";
import { useStreamLoader } from "../hooks/useStreamLoader";
import { favouritesService } from "../services/favouritesService";
import type { FavouriteItem } from "../types";

type FilterKey = "all" | "movie" | "series";

const filters: { key: FilterKey; label: string; icon: typeof FilmIcon }[] = [
	{ key: "all", label: "All", icon: HeartIcon },
	{ key: "movie", label: "Movies", icon: FilmIcon },
	{ key: "series", label: "Series", icon: VideoCameraIcon }
];

function sortByRecent(items: FavouriteItem[]): FavouriteItem[] {
	return [...items].sort((a, b) => b.addedAt.localeCompare(a.addedAt));
}

export default function Favourites() {
	const { id } = useParams();
	const stream = useStreamLoader(id);
	const [favourites, setFavourites] = useState<FavouriteItem[]>([]);
	const [activeFilter, setActiveFilter] = useState<FilterKey>("all");

	useEffect(() => {
		if (!stream) return;
		setFavourites(sortByRecent(favouritesService.getAll(stream.id)));
	}, [stream]);

	const counts = useMemo(
		() => ({
			all: favourites.length,
			movie: favourites.filter((item) => item.type === "movie").length,
			series: favourites.filter((item) => item.type === "series").length
		}),
		[favourites]
	);

	const visibleFavourites = useMemo(
		() => (activeFilter === "all" ? favourites : favourites.filter((item) => item.type === activeFilter)),
		[favourites, activeFilter]
	);

	const removeFavourite = (item: FavouriteItem) => {
		favouritesService.toggle(item);
		setFavourites((current) =>
			current.filter((favourite) =>
				!(favourite.streamId === item.streamId && favourite.type === item.type && favourite.id === item.id)
			)
		);
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
							<HeartSolidIcon className="h-7 w-7 text-secondary-400" />
							Favourites
						</h1>
					</div>

					<div className="flex flex-wrap gap-2">
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
					</div>
				</header>

				{visibleFavourites.length === 0 ? (
					<div className="flex flex-col items-center justify-center gap-3 py-32 text-center">
						<HeartIcon className="h-16 w-16 text-primary-600" />
						<p className="text-2xl font-bold text-white">No favourites yet</p>
						<p className="max-w-md text-secondary-700">
							Add movies and series to your favourites to find them here in one place.
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
					<div className="flex flex-wrap gap-5 py-8">
						{visibleFavourites.map((item) => (
							<PosterCard
								key={`${item.streamId}:${item.type}:${item.id}`}
								to={item.route}
								title={item.title}
								image={item.image}
								subtitle={item.subtitle}
								badge={
									<>
										{item.type === "movie" ? <FilmIcon className="h-3 w-3" /> : <VideoCameraIcon className="h-3 w-3" />}
										{item.type}
									</>
								}
								actions={
									<button
										type="button"
										onClick={() => removeFavourite(item)}
										title="Remove from favourites"
										className="invisible rounded-full bg-dark/70 p-2 text-white opacity-0 backdrop-blur transition hover:bg-red-600 focus:visible focus:opacity-100 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"
									>
										<TrashIcon className="h-5 w-5" />
									</button>
								}
							/>
						))}
					</div>
				)}
			</div>
		</div>
	);
}
