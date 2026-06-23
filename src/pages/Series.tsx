import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { VideoCameraIcon } from "@heroicons/react/24/outline";
import CategoryList from "../components/CategoryList";
import LoadingSpinner from "../components/LoadingSpinner";
import NotFound from "../components/NotFound";
import PosterCard from "../components/PosterCard";
import SearchBar from "../components/SearchBar";
import { useSerieCategories } from "../hooks/useCategories";
import { useSearch } from "../hooks/useSearch";
import { useStreamLoader } from "../hooks/useStreamLoader";
import { apiService } from "../services/apiService";
import { filterAdultItems, isAdultCategory } from "../services/adultContentFilter";
import { storageService } from "../services/storageService";
import type { Category, SeriesItem } from "../types";

export default function Series() {
	const { id } = useParams();
	const stream = useStreamLoader(id);
	const { categories } = useSerieCategories(stream);

	const itemsPerPage = stream?.settings.maxVodPerPage ?? 50;
	const [selectedSerieCategory, setSelectedSerieCategory] = useState<Category | null>(null);
	const [series, setSeries] = useState<SeriesItem[]>([]);
	const [loading, setLoading] = useState(false);
	const [page, setPage] = useState(0);
	const adultContentEnabled = stream?.settings.adultChannel ?? false;
	const visibleCategories = filterAdultItems(categories, adultContentEnabled);
	const visibleSeries = filterAdultItems(series, adultContentEnabled, selectedSerieCategory?.category_name);
	const seriesSearchFields = useMemo(
		() => [
			{ getValue: (serie: SeriesItem) => serie.name, weight: 3 },
			{ getValue: (serie: SeriesItem) => serie.rating_5based },
			{ getValue: () => selectedSerieCategory?.category_name }
		],
		[selectedSerieCategory]
	);
	const {
		query: searchQuery,
		results: searchedSeries,
		setQuery: setSearchQuery,
		clearSearch
	} = useSearch({ items: visibleSeries, fields: seriesSearchFields });

	useEffect(() => {
		if (!stream) return;
		const saved = storageService.getSelectedCategory(stream.id, "SELECTED_SERIE_CATEGORY");
		setSelectedSerieCategory(saved && (!adultContentEnabled || !isAdultCategory(saved)) ? saved : null);
	}, [stream, adultContentEnabled]);

	useEffect(() => {
		setPage(0);
	}, [itemsPerPage, selectedSerieCategory, searchQuery]);

	useEffect(() => {
		if (!stream || !selectedSerieCategory) return;

		const controller = new AbortController();
		const categoryId = selectedSerieCategory.category_id === "all" ? undefined : selectedSerieCategory.category_id;

		const fetchSeries = async () => {
			setLoading(true);
			const data = await apiService.fetchSeriesByCategory(stream, categoryId, controller.signal);

			if (!controller.signal.aborted) {
				setSeries(data ?? []);
				setLoading(false);
			}
		};

		void fetchSeries();

		return () => controller.abort();
	}, [selectedSerieCategory, stream]);

	const handleCategorySelect = (category: Category) => {
		if (!stream) return;
		if (!adultContentEnabled && isAdultCategory(category)) return;
		setSelectedSerieCategory(category);
		storageService.setSelectedCategory(stream.id, "SELECTED_SERIE_CATEGORY", category);
	};

	if (!stream) {
		return <NotFound message="Stream not found" />;
	}

	return (
		<div className="bg-dark text-secondary min-h-screen flex flex-row">
			<CategoryList
				categories={visibleCategories}
				selectedCategory={selectedSerieCategory}
				handleCategorySelect={handleCategorySelect}
				title="Series"
				backLink={`/menu/${id}`}
			/>

			<div className="h-screen w-2/3 overflow-y-scroll bg-dark px-6 py-8 text-secondary md:w-4/5">
				{selectedSerieCategory ? (
					<>
						<div className="mb-5 flex flex-wrap items-center gap-3">
							<h1 className="text-2xl font-bold text-white">{selectedSerieCategory.category_name}</h1>
							<span className="rounded-full bg-secondary-400/15 px-3 py-1 text-xs font-bold text-secondary-400">
								{searchedSeries.length} series
							</span>
						</div>
						<SearchBar
							value={searchQuery}
							onChange={setSearchQuery}
							onClear={clearSearch}
							placeholder="Search series"
							resultCount={searchedSeries.length}
							totalCount={visibleSeries.length}
						/>

						{loading ? (
							<div className="flex justify-center mt-10">
								<LoadingSpinner />
							</div>						) : (
							<div className="fade-in">
								<div className="flex flex-wrap gap-5">
									{searchedSeries.slice(page * itemsPerPage, (page + 1) * itemsPerPage).map((serie) => (
										<PosterCard
											key={serie.series_id}
											to={`v/${serie.series_id}`}
											title={serie.name}
											image={serie.cover}
											rating={serie.rating_5based}
											ratingScale={5}
										/>
									))}
								</div>

								{searchedSeries.length > itemsPerPage && (
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
											Page <span className="font-bold text-white">{page + 1}</span> / {Math.ceil(searchedSeries.length / itemsPerPage)}
										</span>
										<button
											type="button"
											onClick={() => setPage((p) => Math.min(Math.ceil(searchedSeries.length / itemsPerPage) - 1, p + 1))}
											disabled={page >= Math.ceil(searchedSeries.length / itemsPerPage) - 1}
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
						<VideoCameraIcon className="h-16 w-16 text-primary-600" />
						<p className="text-xl font-semibold text-white">Select a category</p>
						<p className="text-sm text-secondary-700">Pick a category on the left to browse series</p>
					</div>
				)}
			</div>
		</div>
	);
}
