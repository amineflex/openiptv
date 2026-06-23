import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
	ArrowLeftIcon,
	FilmIcon,
	HeartIcon,
	TrashIcon,
	VideoCameraIcon
} from "@heroicons/react/24/outline";
import { HeartIcon as HeartSolidIcon } from "@heroicons/react/24/solid";
import NotFound from "../components/NotFound";
import { useStreamLoader } from "../hooks/useStreamLoader";
import { favouritesService } from "../services/favouritesService";
import type { FavouriteItem } from "../types";

const placeholderPoster = "https://popcornusa.s3.amazonaws.com/placeholder-movieimage.png";

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
	const [favourites, setFavourites] = useState<FavouriteItem[]>(() => sortByRecent(favouritesService.getAll()));
	const [activeFilter, setActiveFilter] = useState<FilterKey>("all");

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
			current.filter((favourite) => !(favourite.type === item.type && favourite.id === item.id))
		);
	};

	if (!stream) {
		return <NotFound message="Stream not found" />;
	}

	return (
		<div className="bg-dark text-secondary min-h-screen">
			<div className="mx-auto max-w-7xl px-6 py-8">
				<header className="flex flex-col gap-5 border-b border-primary/40 pb-6 md:flex-row md:items-center md:justify-between">
					<div className="flex items-center gap-4">
						<Link
							to={`/menu/${id}`}
							className="rounded-full bg-primary/20 p-2 text-secondary-400 hover:bg-primary/40"
						>
							<ArrowLeftIcon className="h-6 w-6" />
						</Link>
						<div>
							<p className="text-sm font-semibold uppercase text-secondary-700">OpenIPTV</p>
							<h1 className="mt-1 flex items-center gap-2 text-3xl font-bold text-white">
								<HeartSolidIcon className="h-7 w-7 text-secondary-400" />
								Favourites
							</h1>
						</div>
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
					<div className="flex flex-wrap gap-4 py-8">
						{visibleFavourites.map((item) => (
							<div key={`${item.type}:${item.id}`} className="group relative">
								<Link
									to={item.route}
									style={{
										backgroundImage: `url(${item.image || placeholderPoster})`,
										backgroundSize: "cover",
										backgroundPosition: "center",
										backgroundRepeat: "no-repeat",
										height: "300px",
										width: "200px"
									}}
									className="flex items-end overflow-hidden rounded-xl border-2 border-transparent bg-dark bg-cover bg-center transition-transform duration-300 hover:scale-105 hover:border-secondary-400/75"
								>
									<div className="w-full bg-gradient-to-t from-dark/90 to-transparent p-4 pt-10 duration-300 group-hover:from-dark">
										<span className="mb-1 inline-flex items-center gap-1 rounded-full bg-dark/60 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-secondary-400">
											{item.type === "movie" ? <FilmIcon className="h-3 w-3" /> : <VideoCameraIcon className="h-3 w-3" />}
											{item.type}
										</span>
										<h2 className="line-clamp-2 text-lg font-semibold text-white/90">{item.title}</h2>
										{item.subtitle && (
											<p className="line-clamp-1 text-xs text-secondary-700">{item.subtitle}</p>
										)}
									</div>
								</Link>

								<button
									type="button"
									onClick={() => removeFavourite(item)}
									title="Remove from favourites"
									className="absolute right-2 top-2 rounded-full bg-dark/70 p-2 text-white opacity-0 backdrop-blur transition group-hover:opacity-100 hover:bg-red-600"
								>
									<TrashIcon className="h-5 w-5" />
								</button>
							</div>
						))}
					</div>
				)}
			</div>
		</div>
	);
}
