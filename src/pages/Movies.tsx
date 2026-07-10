import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { FilmIcon } from "@heroicons/react/24/outline";
import CategoryList from "../components/CategoryList";
import NotFound from "../components/NotFound";
import PosterCard from "../components/PosterCard";
import PosterCardSkeleton from "../components/PosterCardSkeleton";
import SearchBar from "../components/SearchBar";
import SortSelect from "../components/SortSelect";
import { useCachedStreams } from "../hooks/useCachedStreams";
import { useVodCategories } from "../hooks/useCategories";
import { useSearch } from "../hooks/useSearch";
import { useStreamLoader } from "../hooks/useStreamLoader";
import { apiService } from "../services/apiService";
import { filterAdultItems, isAdultCategory } from "../services/adultContentFilter";
import { BASE_SORT_OPTIONS, DATE_SORT_OPTIONS, sortStreams } from "../services/sortStreams";
import { storageService } from "../services/storageService";
import type { SortMode } from "../services/sortStreams";
import type { Category, VodStream } from "../types";

const VOD_SORT_OPTIONS = [...BASE_SORT_OPTIONS, ...DATE_SORT_OPTIONS];

export default function Movies() {
	const { id } = useParams();
	const stream = useStreamLoader(id);
	const { categories } = useVodCategories(stream);

	const itemsPerPage = stream?.settings.maxVodPerPage ?? 50;
	const [selectedVodCategory, setSelectedVodCategory] = useState<Category | null>(null);
	const { items: vods, loading } = useCachedStreams<VodStream>(
		stream,
		selectedVodCategory,
		"get_vod_streams",
		apiService.fetchVodStreamsByCategory
	);
	const [page, setPage] = useState(0);
	const [sort, setSort] = useState<SortMode>("default");
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
	} = useSearch({ items: visibleVods, fields: vodSearchFields, persistKey: stream ? `vod:${stream.id}` : undefined });

	const sortedVods = useMemo(
		() => sortStreams(searchedVods, sort, {
			getName: (vod) => vod.name,
			getDate: (vod) => Number(vod.added) || 0
		}),
		[searchedVods, sort]
	);

	useEffect(() => {
		if (!stream) return;
		const saved = storageService.getSelectedCategory(stream.id, "SELECTED_VOD_CATEGORY");
		setSelectedVodCategory(saved && (!adultContentEnabled || !isAdultCategory(saved)) ? saved : null);
	}, [stream, adultContentEnabled]);

	useEffect(() => {
		setPage(0);
	}, [itemsPerPage, selectedVodCategory, searchQuery, sort]);

	// Keep the page in range if the list shrinks so pagination never blanks out.
	useEffect(() => {
		const pageCount = Math.max(1, Math.ceil(sortedVods.length / itemsPerPage));
		if (page > pageCount - 1) setPage(pageCount - 1);
	}, [sortedVods.length, itemsPerPage, page]);

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

			<div className="h-screen flex-1 overflow-y-auto bg-dark px-6 py-8 text-secondary">
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
							trailing={<SortSelect value={sort} onChange={setSort} options={VOD_SORT_OPTIONS} />}
						/>

						{loading ? (
							<div className="flex flex-wrap gap-5">
								{Array.from({ length: 15 }).map((_, index) => (
									<PosterCardSkeleton key={index} />
								))}
							</div>
						) : sortedVods.length === 0 ? (
							<div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
								<FilmIcon className="h-14 w-14 text-primary-600" />
								<p className="text-lg font-semibold text-white">No movies to show</p>
								<p className="text-sm text-secondary-700">
									{searchQuery
										? "No movie matches your search."
										: "This category came back empty — go back and open it again to reload."}
								</p>
							</div>
						) : (
							<div className="fade-in">
								<div className="flex flex-wrap gap-5">
									{sortedVods.slice(page * itemsPerPage, (page + 1) * itemsPerPage).map((vod) => (
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

								{sortedVods.length > itemsPerPage && (
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
											Page <span className="font-bold text-white">{page + 1}</span> / {Math.ceil(sortedVods.length / itemsPerPage)}
										</span>
										<button
											type="button"
											onClick={() => setPage((p) => Math.min(Math.ceil(sortedVods.length / itemsPerPage) - 1, p + 1))}
											disabled={page >= Math.ceil(sortedVods.length / itemsPerPage) - 1}
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
