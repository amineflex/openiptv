import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useStreamLoader } from '../hooks/useStreamLoader';
import { useVodCategories } from '../hooks/useLiveCategories';
import { apiService } from '../services/apiService';
import NotFound from '../components/NotFound';
import CategoryList from '../components/CategoryList';
import LoadingSpinner from '../components/LoadingSpinner';
import { generateStreamUrl } from '../services/streamService';

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
        const savedVodCategory = localStorage.getItem('selectedVodCategory');
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
        localStorage.setItem('selectedVodCategory', JSON.stringify(category));
    };

    const handleLoadMore = () => {
        setVisibleCount(prevCount => prevCount + limit); 
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
                                <div className="grid md:grid-cols-3 grid-cols-1 gap-4">
                                    {vods.slice(0, visibleCount).map((vod) => (
                                        <Link
                                            key={vod.stream_id}
                                            to={`/watch?src=${generateStreamUrl(stream.domain, "movie", stream.username, stream.password, vod.stream_id, vod.container_extension)}&channel=${vod.name}&icon=${vod.stream_icon}&category=${selectedVodCategory.category_name}`}
                                            className="p-4 bg-primary/10 rounded-xl text-center text-xl flex flex-col items-center text-secondary"
                                        >
                                            <img
                                                src={vod.stream_icon || "https://picsum.photos/200/300"}
                                                alt={vod.name}
                                                className="rounded-xl mb-4"
                                                style={{ maxWidth: '80px', maxHeight: '80px', objectFit: 'cover' }}
                                            />
                                            <h3 className="text-lg font-semibold">
                                                <span className="text-dark bg-secondary-400 rounded-full px-2 mr-2">{vod.num}</span>
                                                <span>{vod.name}</span>
                                            </h3>
                                            <p className="text-sm">{selectedVodCategory.category_name}</p>
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
                    <div className='h-full flex items-center justify-center'>
                        <p className="text-2xl text-center text-secondary inline-flex justify-center items-center">
                            <span className="mb-6">Select a category to explore</span>
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
