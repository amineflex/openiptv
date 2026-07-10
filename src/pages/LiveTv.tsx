import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { PlayCircleIcon, TvIcon } from "@heroicons/react/24/outline";
import CategoryList from "../components/CategoryList";
import ChannelRowSkeleton from "../components/ChannelRowSkeleton";
import NotFound from "../components/NotFound";
import SearchBar from "../components/SearchBar";
import SortSelect from "../components/SortSelect";
import { useCachedStreams } from "../hooks/useCachedStreams";
import { useLiveCategories } from "../hooks/useCategories";
import { useSearch } from "../hooks/useSearch";
import { useStreamLoader } from "../hooks/useStreamLoader";
import { apiService } from "../services/apiService";
import { filterAdultItems, isAdultCategory } from "../services/adultContentFilter";
import { BASE_SORT_OPTIONS, sortStreams } from "../services/sortStreams";
import { generateStreamUrl } from "../services/streamService";
import { storageService } from "../services/storageService";
import { buildWatchRoute } from "../services/watchRoute";
import type { SortMode } from "../services/sortStreams";
import type { Category, ChannelSwitcherItem, GuideCategoryItem, LiveChannel } from "../types";

function getChannelInitials(name: string): string {
	const words = name.trim().split(/\s+/).filter(Boolean);
	if (words.length === 0) return "TV";
	return words.slice(0, 2).map((word) => word[0]).join("").toUpperCase();
}

export default function LiveTv() {
	const { id } = useParams();
	const stream = useStreamLoader(id);
	const { categories } = useLiveCategories(stream);

	const itemsPerPage = stream?.settings.maxChannelsPerCategory ?? 200;
	const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
	const { items: channels, loading } = useCachedStreams<LiveChannel>(
		stream,
		selectedCategory,
		"get_live_streams",
		apiService.fetchLiveStreamsByCategory
	);
	const [page, setPage] = useState(0);
	const [sort, setSort] = useState<SortMode>("default");
	const adultContentEnabled = stream?.settings.adultChannel ?? false;
	const visibleCategories = useMemo(
		() => filterAdultItems(categories, adultContentEnabled),
		[categories, adultContentEnabled]
	);
	const visibleChannels = useMemo(
		() => filterAdultItems(channels, adultContentEnabled, selectedCategory?.category_name),
		[channels, adultContentEnabled, selectedCategory]
	);
	const channelSearchFields = useMemo(
		() => [
			{ getValue: (channel: LiveChannel) => channel.name, weight: 3 },
			{ getValue: (channel: LiveChannel) => channel.num },
			{ getValue: () => selectedCategory?.category_name }
		],
		[selectedCategory]
	);
	const {
		query: searchQuery,
		results: searchedChannels,
		setQuery: setSearchQuery,
		clearSearch
	} = useSearch({ items: visibleChannels, fields: channelSearchFields, persistKey: stream ? `live:${stream.id}` : undefined });

	// Live channels carry no meaningful date, so only name sorts are offered.
	const displayedChannels = useMemo(
		() => sortStreams(searchedChannels, sort, { getName: (channel) => channel.name }),
		[searchedChannels, sort]
	);

	useEffect(() => {
		if (!stream) return;
		const saved = storageService.getSelectedCategory(stream.id, "SELECTED_CATEGORY");
		setSelectedCategory(saved && (!adultContentEnabled || !isAdultCategory(saved)) ? saved : null);
	}, [stream, adultContentEnabled]);

	useEffect(() => {
		setPage(0);
	}, [itemsPerPage, selectedCategory, searchQuery, sort]);

	// Keep the page in range if the list shrinks (e.g. a background refresh
	// returns fewer channels) so pagination never lands on a blank page.
	useEffect(() => {
		const pageCount = Math.max(1, Math.ceil(displayedChannels.length / itemsPerPage));
		if (page > pageCount - 1) setPage(pageCount - 1);
	}, [displayedChannels.length, itemsPerPage, page]);

	const channelLinks = useMemo(() => {
		if (!stream || !selectedCategory) return [];

		return displayedChannels.slice(page * itemsPerPage, (page + 1) * itemsPerPage).map((channel) => {
			const src = generateStreamUrl(
				stream.domain,
				"live",
				stream.username,
				stream.password,
				channel.stream_id,
				stream.settings.streamFormat
			);

			return {
				channel,
				to: buildWatchRoute({
					src,
					type: "live_tv",
					channel: channel.name,
					icon: channel.stream_icon,
					category: selectedCategory.category_name
				})
			};
		});
	}, [displayedChannels, selectedCategory, stream, page, itemsPerPage]);

	const categorySwitcherItems = useMemo<GuideCategoryItem[]>(() =>
		visibleCategories.map((cat) => ({ id: cat.category_id, name: cat.category_name })),
	[visibleCategories]
	);

	const channelSwitcherItems = useMemo<ChannelSwitcherItem[]>(() => {
		if (!stream || !selectedCategory) return [];
		return visibleChannels.map((channel) => ({
			name: channel.name,
			icon: channel.stream_icon ?? "",
			num: channel.num,
			url: buildWatchRoute({
				src: generateStreamUrl(
					stream.domain,
					"live",
					stream.username,
					stream.password,
					channel.stream_id,
					stream.settings.streamFormat
				),
				type: "live_tv",
				channel: channel.name,
				icon: channel.stream_icon,
				category: selectedCategory.category_name
			})
		}));
	}, [visibleChannels, stream, selectedCategory]);

	const handleCategorySelect = (category: Category) => {
		if (!stream) return;
		if (!adultContentEnabled && isAdultCategory(category)) return;
		setSelectedCategory(category);
		storageService.setSelectedCategory(stream.id, "SELECTED_CATEGORY", category);
	};

	if (!stream) {
		return <NotFound message="Stream not found" />;
	}

	return (
		<div className="bg-dark text-secondary min-h-screen flex flex-row">
			<CategoryList
				categories={visibleCategories}
				selectedCategory={selectedCategory}
				handleCategorySelect={handleCategorySelect}
				title="Live TV"
				backLink={`/menu/${id}`}
			/>

			<div className="h-screen flex-1 overflow-y-auto bg-dark px-6 py-8 text-secondary">
				{selectedCategory ? (
					<>
						<h1 className="text-2xl font-bold mb-6">
							{selectedCategory.category_name} ({searchedChannels.length} channels)
						</h1>
						<SearchBar
							value={searchQuery}
							onChange={setSearchQuery}
							onClear={clearSearch}
							placeholder="Search channels"
							resultCount={searchedChannels.length}
							totalCount={visibleChannels.length}
							trailing={<SortSelect value={sort} onChange={setSort} options={BASE_SORT_OPTIONS} />}
						/>

						{loading ? (
							<div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
								{Array.from({ length: 9 }).map((_, index) => (
									<ChannelRowSkeleton key={index} />
								))}
							</div>
						) : displayedChannels.length === 0 ? (
							<div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
								<TvIcon className="h-14 w-14 text-primary-600" />
								<p className="text-lg font-semibold text-white">No channels to show</p>
								<p className="text-sm text-secondary-700">
									{searchQuery
										? "No channel matches your search."
										: "This category came back empty — go back and open it again to reload."}
								</p>
							</div>
						) : (
							<div>
								<div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
									{channelLinks.map(({ channel, to }) => (
										<Link
											key={channel.stream_id}
											to={to}
											state={{
												channels: channelSwitcherItems,
												categories: categorySwitcherItems,
												selectedCategoryId: selectedCategory?.category_id ?? "",
												profileId: id,
												backTo: `/menu/${id}/tv`,
												backLabel: "Live TV"
											}}
											className="group flex min-h-[112px] items-center gap-4 rounded-xl border border-white/10 bg-primary/10 p-4 text-left text-secondary shadow-lg shadow-black/10 transition duration-200 hover:-translate-y-0.5 hover:border-secondary-400/70 hover:bg-primary/20 hover:shadow-secondary-400/10"
										>
											<div className="relative flex h-16 w-16 flex-none items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-dark/70">
												<span className="text-sm font-black text-secondary-400">{getChannelInitials(channel.name)}</span>
												{channel.stream_icon && (
													<img
														src={channel.stream_icon}
														alt={channel.name}
														loading="lazy"
														className="absolute inset-0 h-full w-full bg-dark object-contain p-2"
														onError={(event) => {
															event.currentTarget.style.display = "none";
														}}
													/>
												)}
											</div>

											<div className="min-w-0 flex-1">
												<div className="mb-1 flex items-center gap-2 text-xs">
													<span className="rounded-full bg-secondary-400 px-2 py-0.5 font-black text-dark">
														{channel.num || channel.stream_id}
													</span>
													<span className="inline-flex min-w-0 items-center gap-1 text-secondary-700">
														<TvIcon className="h-3.5 w-3.5 flex-none text-secondary-400" />
														<span className="truncate">{selectedCategory.category_name}</span>
													</span>
												</div>
												<h3 className="line-clamp-2 text-base font-bold leading-snug text-white">{channel.name}</h3>
											</div>

											<PlayCircleIcon className="h-8 w-8 flex-none text-secondary-700 transition group-hover:text-secondary-400" />
										</Link>
									))}
								</div>

								{displayedChannels.length > itemsPerPage && (
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
											Page <span className="font-bold text-white">{page + 1}</span> / {Math.ceil(displayedChannels.length / itemsPerPage)}
										</span>
										<button
											type="button"
											onClick={() => setPage((p) => Math.min(Math.ceil(displayedChannels.length / itemsPerPage) - 1, p + 1))}
											disabled={page >= Math.ceil(displayedChannels.length / itemsPerPage) - 1}
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
					<div className="h-full flex items-center justify-center">
						<p className="text-2xl text-center text-secondary inline-flex justify-center items-center">
							<span className="mb-6">Select a category to explore</span>
						</p>
					</div>
				)}
			</div>
		</div>
	);
}
