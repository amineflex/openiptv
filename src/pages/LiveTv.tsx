import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
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
import type { Category, LiveChannel } from "../types";

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
		const saved = storageService.getSelectedCategory("SELECTED_CATEGORY");
		setSelectedCategory(saved && (!adultContentEnabled || !isAdultCategory(saved)) ? saved : null);
	}, [stream?.id, adultContentEnabled]);

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

	const handleCategorySelect = (category: Category) => {
		if (!adultContentEnabled && isAdultCategory(category)) return;
		setSelectedCategory(category);
		storageService.setSelectedCategory("SELECTED_CATEGORY", category);
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
								<div className="grid md:grid-cols-3 grid-cols-1 gap-4">
									{channelLinks.map(({ channel, to }) => (
										<Link
											key={channel.stream_id}
											to={to}
											className="group p-4 bg-primary/10 rounded-xl text-center text-xl flex flex-col items-center text-secondary border-2 border-transparent hover:border-secondary-400 hover:bg-primary/20 duration-150"
										>
											<img
												src={channel.stream_icon || "https://picsum.photos/200/300"}
												alt={channel.name}
												className="rounded-xl mb-4"
												style={{ maxWidth: "80px", maxHeight: "80px", objectFit: "cover" }}
											/>
											<h3 className="text-lg font-semibold">
												<span className="text-dark bg-secondary-400 rounded-full px-2 mr-2">{channel.num}</span>
												<span>{channel.name}</span>
											</h3>
											<p className="text-sm">{selectedCategory.category_name}</p>
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
