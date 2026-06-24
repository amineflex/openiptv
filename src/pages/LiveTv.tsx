import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { PlayCircleIcon, TvIcon } from "@heroicons/react/24/outline";
import CategoryList from "../components/CategoryList";
import LoadingSpinner from "../components/LoadingSpinner";
import NotFound from "../components/NotFound";
import SearchBar from "../components/SearchBar";
import { useLiveCategories } from "../hooks/useCategories";
import { useSearch } from "../hooks/useSearch";
import { useStreamLoader } from "../hooks/useStreamLoader";
import { apiService } from "../services/apiService";
import { filterAdultItems, isAdultCategory } from "../services/adultContentFilter";
import { generateStreamUrl } from "../services/streamService";
import { storageService } from "../services/storageService";
import { buildWatchRoute } from "../services/watchRoute";
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

	const limit = stream?.settings.maxChannelsPerCategory ?? 200;
	const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
	const [channels, setChannels] = useState<LiveChannel[]>([]);
	const [loading, setLoading] = useState(false);
	const [visibleCount, setVisibleCount] = useState(limit);
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
	} = useSearch({ items: visibleChannels, fields: channelSearchFields });

	useEffect(() => {
		if (!stream) return;
		const saved = storageService.getSelectedCategory(stream.id, "SELECTED_CATEGORY");
		setSelectedCategory(saved && (!adultContentEnabled || !isAdultCategory(saved)) ? saved : null);
	}, [stream, adultContentEnabled]);

	useEffect(() => {
		setVisibleCount(limit);
	}, [limit, selectedCategory, searchQuery]);

	useEffect(() => {
		if (!stream || !selectedCategory) return;

		const controller = new AbortController();
		const categoryId = selectedCategory.category_id === "all" ? undefined : selectedCategory.category_id;

		const fetchChannels = async () => {
			setLoading(true);
			const data = await apiService.fetchLiveStreamsByCategory(stream, categoryId, controller.signal);

			if (!controller.signal.aborted) {
				setChannels(data ?? []);
				setLoading(false);
			}
		};

		void fetchChannels();

		return () => controller.abort();
	}, [selectedCategory, stream]);

	const channelLinks = useMemo(() => {
		if (!stream || !selectedCategory) return [];

		return searchedChannels.slice(0, visibleCount).map((channel) => {
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
	}, [searchedChannels, selectedCategory, stream, visibleCount]);

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

			<div className="md:w-4/5 w-2/3 bg-dark text-secondary h-screen overflow-y-scroll px-5 py-10">
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
						/>

						{loading ? (
							<div className="flex justify-center mt-10">
								<LoadingSpinner />
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
											profileId: id
										}}
											className="group flex min-h-[112px] items-center gap-4 rounded-xl border border-white/10 bg-primary/10 p-4 text-left text-secondary shadow-lg shadow-black/10 transition duration-200 hover:-translate-y-0.5 hover:border-secondary-400/70 hover:bg-primary/20 hover:shadow-secondary-400/10"
										>
											<div className="flex h-16 w-16 flex-none items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-dark/70">
												{channel.stream_icon ? (
													<img
														src={channel.stream_icon}
														alt={channel.name}
														loading="lazy"
														className="h-full w-full object-contain p-2"
														onError={(event) => {
															event.currentTarget.style.display = "none";
														}}
													/>
												) : (
													<span className="text-sm font-black text-secondary-400">{getChannelInitials(channel.name)}</span>
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

								{visibleCount < searchedChannels.length && (
									<div className="flex justify-center mt-6">
										<button
											type="button"
											onClick={() => setVisibleCount((prevCount) => prevCount + limit)}
											className="px-6 py-2 text-secondary bg-secondary-400/10 rounded-xl hover:text-secondary-400 hover:bg-secondary-400/25"
										>
											Load More
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
