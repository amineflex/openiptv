import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { FilmIcon } from "@heroicons/react/24/outline";
import CategoryList from "../components/CategoryList";
import LoadingSpinner from "../components/LoadingSpinner";
import NotFound from "../components/NotFound";
import PosterCard from "../components/PosterCard";
import SearchBar from "../components/SearchBar";
import { useVodCategories } from "../hooks/useCategories";
import { useSearch } from "../hooks/useSearch";
import { useStreamLoader } from "../hooks/useStreamLoader";
import { apiService } from "../services/apiService";
import { filterAdultItems, isAdultCategory } from "../services/adultContentFilter";
import { storageService } from "../services/storageService";
import type { Category, VodStream } from "../types";

export default function Movies() {
	const { id } = useParams();
	const stream = useStreamLoader(id);
	const { categories } = useVodCategories(stream);

	const itemsPerPage = stream?.settings.maxVodPerPage ?? 50;
	const [selectedVodCategory, setSelectedVodCategory] = useState<Category | null>(null);
	const [vods, setVods] = useState<VodStream[]>([]);
	const [loading, setLoading] = useState(false);
	const [page, setPage] = useState(0);
	const adultContentEnabled = stream?.settings.adultChannel ?? false;
	const visibleCategories = filterAdultItems(categories, adultContentEnabled);
	const visibleVods = filterAdultItems(vods, adultContentEnabled, selectedVodCategory?.category_name);
	const vodSearchFields = useMemo(
		() => [
			{ getValue: (vod: VodStream) => vod.name, weight: 3 },
			{ getValue: (vod: VodStream) => vod.rating },
			{ getValue: () => selectedVodCategory?.category_name }
		],
		[selectedVodCategory]
	);
	const {
		query: searchQuery,
		results: searchedVods,
		setQuery: setSearchQuery,
		clearSearch
	} = useSearch({ items: visibleVods, fields: vodSearchFields });

	useEffect(() => {
		if (!stream) return;
		const saved = storageService.getSelectedCategory(stream.id, "SELECTED_VOD_CATEGORY");
		setSelectedVodCategory(saved && (!adultContentEnabled || !isAdultCategory(saved)) ? saved : null);
	}, [stream, adultContentEnabled]);

	useEffect(() => {
		setPage(0);
	}, [itemsPerPage, selectedVodCategory, searchQuery]);

	useEffect(() => {
		if (!stream || !selectedVodCategory) return;

		const controller = new AbortController();
		const categoryId = selectedVodCategory.category_id === "all" ? undefined : selectedVodCategory.category_id;

		const fetchVods = async () => {
			setLoading(true);
			const data = await apiService.fetchVodStreamsByCategory(stream, categoryId, controller.signal);

			if (!controller.signal.aborted) {
				setVods(data ?? []);
				setLoading(false);
			}
		};

		void fetchVods();

		return () => controller.abort();
	}, [selectedVodCategory, stream]);

	const handleCategorySelect = (category: Category) => {
		if (!stream) return;
		if (!adultContentEnabled && isAdultCategory(category)) return;
		setSelectedVodCategory(category);
		storageService.setSelectedCategory(stream.id, "SELECTED_VOD_CATEGORY", category);
	};

	if (!stream) {
		return <NotFound message="Stream not found" />;
	}

	return (
		<div className="bg-dark text-secondary min-h-screen flex flex-row">
			<CategoryList
				categories={visibleCategories}
				selectedCategory={selectedVodCategory}
				handleCategorySelect={handleCategorySelect}
				title="VOD"
				backLink={`/menu/${id}`}
			/>

			<div className="h-screen w-2/3 overflow-y-scroll bg-dark px-6 py-8 text-secondary md:w-4/5">
				{selectedVodCategory ? (
					<>
						<div className="mb-5 flex flex-wrap items-center gap-3">
							<h1 className="text-2xl font-bold text-white">{selectedVodCategory.category_name}</h1>
							<span className="rounded-full bg-secondary-400/15 px-3 py-1 text-xs font-bold text-secondary-400">
								{searchedVods.length} movies
							</span>
						</div>
						<SearchBar
							value={searchQuery}
							onChange={setSearchQuery}
							onClear={clearSearch}
							placeholder="Search movies"
							resultCount={searchedVods.length}
							totalCount={visibleVods.length}
						/>

						{loading ? (
							<div className="flex justify-center mt-10">
								<LoadingSpinner />
							</div>
						) : (
							<div className="fade-in">
								<div className="flex flex-wrap gap-5">
									{searchedVods.slice(page * itemsPerPage, (page + 1) * itemsPerPage).map((vod) => (
										<PosterCard
											key={vod.stream_id}
											to={`v/${vod.stream_id}`}
											title={vod.name}
											image={vod.stream_icon}
											rating={vod.rating}
											ratingScale={10}
										/>
									))}
								</div>

								{searchedVods.length > itemsPerPage && (
									<div className="mt-8 flex items-center justify-center gap-3">
										<button
											type="button"
											onClick={() => setPage((p) => Math.max(0, p - 1))}
											disabled={page === 0}
											className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 font-semibold text-secondary transition hover:border-secondary-400/50 hover:text-secondary-400 disabled:cursor-not-allowed disabled:opacity-30"
										>
											&#8592; Prev
										</button>
										<span className="rounded-lg bg-white/5 px-3 py-2 text-sm text-secondary-700">
											Page <span className="font-bold text-white">{page + 1}</span> / {Math.ceil(searchedVods.length / itemsPerPage)}
										</span>
										<button
											type="button"
											onClick={() => setPage((p) => Math.min(Math.ceil(searchedVods.length / itemsPerPage) - 1, p + 1))}
											disabled={page >= Math.ceil(searchedVods.length / itemsPerPage) - 1}
											className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 font-semibold text-secondary transition hover:border-secondary-400/50 hover:text-secondary-400 disabled:cursor-not-allowed disabled:opacity-30"
										>
											Next &#8594;
										</button>
									</div>
								)}
							</div>
						)}
					</>
				) : (
					<div className="flex h-full flex-col items-center justify-center gap-3 text-center">
						<FilmIcon className="h-16 w-16 text-primary-600" />
						<p className="text-xl font-semibold text-white">Select a category</p>
						<p className="text-sm text-secondary-700">Pick a category on the left to browse movies</p>
					</div>
				)}
			</div>
		</div>
	);
}
