import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import CategoryList from "../components/CategoryList";
import LoadingSpinner from "../components/LoadingSpinner";
import NotFound from "../components/NotFound";
import { useVodCategories } from "../hooks/useLiveCategories";
import { useStreamLoader } from "../hooks/useStreamLoader";
import { apiService } from "../services/apiService";

export default function Movies() {
	const { id } = useParams();
	const stream = useStreamLoader(id);
	const categories = useVodCategories(stream);

	const limit = 200;

	const [selectedVodCategory, setSelectedVodCategory] = useState(null);
	const [vods, setVods] = useState([]);
	const [loading, setLoading] = useState(false);
	const [visibleCount, setVisibleCount] = useState(limit);

	useEffect(() => {
		const savedVodCategory = localStorage.getItem("selectedVodCategory");
		if (savedVodCategory) {
			setSelectedVodCategory(JSON.parse(savedVodCategory));
		}
	}, [stream]);

	useEffect(() => {
		const fetchVods = async () => {
			if (stream && selectedVodCategory) {
				setLoading(true);
				const data = await apiService.fetchVodStreamsByCategory(stream, selectedVodCategory.category_id);
				setVods(data || []);
				setLoading(false);
			}
		};
		fetchVods();
	}, [selectedVodCategory, stream]);

	const handleCategorySelect = (category) => {
		setSelectedVodCategory(category);
		localStorage.setItem("selectedVodCategory", JSON.stringify(category));
	};

	const handleLoadMore = () => {
		setVisibleCount((prevCount) => prevCount + limit);
	};

	if (!stream) {
		return <NotFound message="Stream not found" />;
	}

	return (
		<div className="bg-dark text-secondary min-h-screen flex flex-row">
			<CategoryList
				categories={categories}
				selectedCategory={selectedVodCategory}
				handleCategorySelect={handleCategorySelect}
				title="VOD"
				backLink={`/menu/${id}`}
			/>

			<div className="md:w-4/5 w-2/3 bg-dark text-secondary h-screen overflow-y-scroll px-5 py-10">
				{selectedVodCategory ? (
					<>
						<h1 className="text-2xl font-bold mb-6">
							{selectedVodCategory.category_name} ({vods.length} vods)
						</h1>

						{loading ? (
							<LoadingSpinner />
						) : (
							<div>
								<div className="flex flex-wrap gap-4">
									{vods.slice(0, visibleCount).map((vod) => (
										<Link
											key={vod.stream_id}
											// to={`/watch?src=${generateStreamUrl(stream.domain, "movie", stream.username, stream.password, vod.stream_id, vod.container_extension)}&type=vod&channel=${vod.name}&icon=${vod.stream_icon}&category=${selectedVodCategory.category_name}`}
											to={`v/${vod.stream_id}`}
											style={{
												backgroundImage: `url(${vod.stream_icon || "https://popcornusa.s3.amazonaws.com/placeholder-movieimage.png"})`,
												backgroundSize: "cover",
												backgroundPosition: "center",
												backgroundRepeat: "no-repeat",
												height: "300px",
												width: "200px",
												borderRadius: "1rem",
												transition: "transform 0.3s ease-in-out"
											}}
											className="group bg-dark bg-cover bg-center bg-no-repeat rounded-xl flex items-end hover:transform hover:scale-105 border-2 border-transparent hover:border-secondary-400/75 hover:shadow-secondary-400/50"
										>
											<div className="bg-gradient-to-t from-dark/75 to-transparent p-4 pt-10 group-hover:hidden duration-300">
												<h2 className="text-lg font-semibold text-white/90">{vod.name}</h2>
												<span className="text-sm">{vod.rating}/10</span>
											</div>
										</Link>
									))}
								</div>
								{/* Load More Button */}
								{visibleCount < vods.length && (
									<div className="flex justify-center mt-6">
										<button
											onClick={handleLoadMore}
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
