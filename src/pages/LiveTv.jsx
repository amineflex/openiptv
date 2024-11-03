import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useStreamLoader } from '../hooks/useStreamLoader';
import { useLiveCategories } from '../hooks/useLiveCategories';
import { apiService } from '../services/apiService';
import NotFound from '../components/NotFound';
import CategoryList from '../components/CategoryList';
import LoadingSpinner from '../components/LoadingSpinner';
import { generateStreamUrl } from '../services/streamService';

export default function LiveTv() {
    const { id } = useParams();
    const stream = useStreamLoader(id);
    const categories = useLiveCategories(stream);

    const [selectedCategory, setSelectedCategory] = useState(null);
    const [channels, setChannels] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const savedCategory = localStorage.getItem('selectedCategory');
        if (savedCategory) {
            setSelectedCategory(JSON.parse(savedCategory));
        }
    }, [stream]);

    useEffect(() => {
        const fetchChannels = async () => {
            if (stream && selectedCategory) {
                setLoading(true);
                const data = await apiService.fetchLiveStreamsByCategory(stream, selectedCategory.category_id);
                setChannels(data || []);
                setLoading(false);
            }
        };
        fetchChannels();
    }, [selectedCategory, stream]);

    const handleCategorySelect = (category) => {
        setSelectedCategory(category);
        localStorage.setItem('selectedCategory', JSON.stringify(category));
    };

    if (!stream) {
        return <NotFound message="Stream not found" />;
    }

    return (
        <div className="bg-dark text-secondary min-h-screen flex flex-row">
            <CategoryList
                categories={categories}
                selectedCategory={selectedCategory}
                handleCategorySelect={handleCategorySelect}
                title="Live TV"
                backLink={`/menu/${id}`}
            />

            <div className="md:w-4/5 w-2/3 bg-dark text-secondary h-screen overflow-y-scroll px-5 py-10">
                {selectedCategory ? (
                    <>
                        <h1 className="text-2xl font-bold mb-6">
                            {selectedCategory.category_name} ({channels.length} channels)
                        </h1>

                        {loading ? (
                            <LoadingSpinner />
                        ) : (
                            <div className="grid md:grid-cols-3 grid-cols-1 gap-4">
                                {channels.map((channel) => (
                                    <Link
                                        key={channel.stream_id}
                                        to={`/watch?src=${generateStreamUrl(stream.domain, stream.username, stream.password, channel.stream_id)}&channel=${channel.name}&icon=${channel.stream_icon}&category=${selectedCategory.category_name}`}
                                        className="p-4 bg-primary/10 rounded-xl text-center text-xl flex flex-col items-center text-secondary"
                                    >
                                        <img
                                            src={channel.stream_icon || "https://picsum.photos/200/300"}
                                            alt={channel.name}
                                            className="rounded-xl mb-4"
                                            style={{ maxWidth: '80px', maxHeight: '80px', objectFit: 'cover' }}
                                        />
                                        <h3 className="text-lg font-semibold">
                                            <span className="text-dark bg-secondary-400 rounded-full px-2 mr-2">{channel.num}</span>
                                            <span>{channel.name}</span>
                                        </h3>
                                        <p className="text-sm">{selectedCategory.category_name}</p>
                                    </Link>
                                ))}
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
