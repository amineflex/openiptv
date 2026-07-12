import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { VideoCameraIcon } from "@heroicons/react/24/outline";
import CategoryList from "../components/CategoryList";
import NotFound from "../components/NotFound";
import PosterCard from "../components/PosterCard";
import PosterCardSkeleton from "../components/PosterCardSkeleton";
import SearchBar from "../components/SearchBar";
import SortSelect from "../components/SortSelect";
import { useCachedStreams } from "../hooks/useCachedStreams";
import { useSerieCategories } from "../hooks/useCategories";
import { useSearch } from "../hooks/useSearch";
import { useStreamLoader } from "../hooks/useStreamLoader";
import { apiService } from "../services/apiService";
import { filterAdultItems, isAdultCategory } from "../services/adultContentFilter";
import { BASE_SORT_OPTIONS, DATE_SORT_OPTIONS, sortStreams } from "../services/sortStreams";
import { storageService } from "../services/storageService";
import type { SortMode } from "../services/sortStreams";
import type { Category, SeriesItem } from "../types";

const SERIES_SORT_OPTIONS = [...BASE_SORT_OPTIONS, ...DATE_SORT_OPTIONS];

export default function Series() {
	const { id } = useParams();
	const stream = useStreamLoader(id);
	const { categories } = useSerieCategories(stream);

	const itemsPerPage = stream?.settings.maxVodPerPage ?? 50;
	const [selectedSerieCategory, setSelectedSerieCategory] = useState<Category | null>(null);
	const { items: series, loading } = useCachedStreams<SeriesItem>(
		stream,
		selectedSerieCategory,
		"get_series",
		apiService.fetchSeriesByCategory
	);
	const [page, setPage] = useState(0);
	const [sort, setSort] = useState<SortMode>("default");
	const adultContentEnabled = stream?.settings.adultChannel ?? false;
	// Memoized so the filtered arrays keep a stable reference between renders —
	// otherwise a fresh array each render would defeat useSearch's debounce and
	// re-run the O(n) scoring/sort over the whole category on every keystroke.
	const visibleCategories = useMemo(
		() => filterAdultItems(categories, adultContentEnabled),
		[categories, adultContentEnabled]
	);
	const visibleSeries = useMemo(
		() => filterAdultItems(series, adultContentEnabled, selectedSerieCategory?.category_name),
		[series, adultContentEnabled, selectedSerieCategory]
	);
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
	} = useSearch({ items: visibleSeries, fields: seriesSearchFields, persistKey: stream ? `series:${stream.id}` : undefined });

	const sortedSeries = useMemo(
		() => sortStreams(searchedSeries, sort, {
			getName: (serie) => serie.name,
			getDate: (serie) => Number(serie.last_modified) || 0
		}),
		[searchedSeries, sort]
	);

	useEffect(() => {
		if (!stream) return;
		const saved = storageService.getSelectedCategory(stream.id, "SELECTED_SERIE_CATEGORY");
		setSelectedSerieCategory(saved && (!adultContentEnabled || !isAdultCategory(saved)) ? saved : null);
	}, [stream, adultContentEnabled]);

	useEffect(() => {
		setPage(0);
	}, [itemsPerPage, selectedSerieCategory, searchQuery, sort]);

	// Keep the page in range if the list shrinks so pagination never blanks out.
	useEffect(() => {
		const pageCount = Math.max(1, Math.ceil(sortedSeries.length / itemsPerPage));
		if (page > pageCount - 1) setPage(pageCount - 1);
	}, [sortedSeries.length, itemsPerPage, page]);

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

			<div className="h-screen flex-1 overflow-y-auto bg-dark px-6 py-8 text-secondary">
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
							trailing={<SortSelect value={sort} onChange={setSort} options={SERIES_SORT_OPTIONS} />}
						/>

						{loading ? (
							<div className="flex flex-wrap gap-5">
								{Array.from({ length: 15 }).map((_, index) => (
									<PosterCardSkeleton key={index} />
								))}
							</div>
						) : sortedSeries.length === 0 ? (
							<div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
								<VideoCameraIcon className="h-14 w-14 text-primary-600" />
								<p className="text-lg font-semibold text-white">No series to show</p>
								<p className="text-sm text-secondary-700">
									{searchQuery
										? "No series matches your search."
										: "This category came back empty — go back and open it again to reload."}
								</p>
							</div>
						) : (
							<div className="fade-in">
								<div className="flex flex-wrap gap-5">
									{sortedSeries.slice(page * itemsPerPage, (page + 1) * itemsPerPage).map((serie) => (
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

								{sortedSeries.length > itemsPerPage && (
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
											Page <span className="font-bold text-white">{page + 1}</span> / {Math.ceil(sortedSeries.length / itemsPerPage)}
										</span>
										<button
											type="button"
											onClick={() => setPage((p) => Math.min(Math.ceil(sortedSeries.length / itemsPerPage) - 1, p + 1))}
											disabled={page >= Math.ceil(sortedSeries.length / itemsPerPage) - 1}
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
