import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useStreamLoader } from '../hooks/useStreamLoader';
import { useLiveCategories } from '../hooks/useLiveCategories';
import { apiService } from '../services/apiService';
import NotFound from '../components/NotFound';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';

export default function LiveTv() {
    const { id } = useParams();
    const stream = useStreamLoader(id);
    const categories = useLiveCategories(stream);

    const [selectedCategory, setSelectedCategory] = useState(null); // Catégorie sélectionnée par défaut est null
    const [channels, setChannels] = useState([]); // Chaînes de la catégorie sélectionnée
    const [loading, setLoading] = useState(false); // État de chargement

    // Fonction pour charger les chaînes selon la catégorie
    useEffect(() => {
        const fetchChannels = async () => {
            if (stream && selectedCategory) { // Ne charge les chaînes que si une catégorie est sélectionnée
                setLoading(true);
                const data = selectedCategory.category_id === 0 // Vérifie si All Channels est sélectionné
                    ? await apiService.fetchAllChannels(stream)
                    : await apiService.fetchLiveStreamsByCategory(stream, selectedCategory.category_id);
                
                setChannels(data || []);
                setLoading(false);
            }
        };
        fetchChannels();
    }, [selectedCategory, stream]);

    if (!stream) {
        return <NotFound message="Stream not found" />;
    }

    return (
        <div className="bg-dark text-secondary min-h-screen">
            <div className='flex flex-row'>
                
                <aside className="md:w-1/5 w-1/3 bg-primary/20 rounded-r-xl text-dark-900 top-0 h-screen overflow-y-scroll px-5 py-5">

                    <Link to = {`/menu/${id}`} className="text-secondary/75 text-sm font-semibold inline-flex items-center rounded-xl bg-primary/10 hover:bg-primary-100 w-full py-0.5 px-2 my-1">
                        <ArrowLeftIcon className="h-4 w-4 mr-2 text-secondary-400 " />
                        <span>Back to Menu</span>
                    </Link>


                    <h1 className="text-3xl text-center font-bold mb-4">Live TV</h1>

                    {/* All channels cat */}
                    <div
                        onClick={() => setSelectedCategory({ category_id: undefined, category_name: "All Channels" })} // Définit "All Channels" comme sélectionné
                        className={`my-2 p-2 rounded-xl truncate cursor-pointer ${selectedCategory?.category_id === undefined ? 'border border-secondary bg-dark' : 'bg-dark'}`}
                    >
                        <h2 className="text-md font-semibold">All Channels</h2>
                    </div>

                    {/* Categories */}
                    {categories.map((category) => (
                        <div
                            key={category.id}
                            onClick={() => setSelectedCategory(category)}
                            className={`my-2 p-2 rounded-xl truncate cursor-pointer ${selectedCategory?.category_id === category.category_id ? 'border border-secondary bg-dark' : 'bg-dark'}`}
                        >
                            <h2 className="text-md font-semibold">{category.category_name}</h2>
                        </div>
                    ))}
                </aside>

                <div className="md:w-4/5 w-2/3 bg-dark text-secondary top-0 h-screen overflow-y-scroll px-5 py-10">
                    
                    {selectedCategory ? (
                        <>
                            <h1 className="text-2xl font-bold mb-6">
                                {selectedCategory.category_name} ({channels.length} channels)
                            </h1>
                            
                            {loading ? (
                                <p className="text-xl text-center text-secondary">Loading...</p>
                            ) : (
                                <div className="grid grid-cols-3 gap-4">
                                    {channels.map((channel) => (
                                        <Link
                                            key={channel.stream_id}
                                            to={`/player/${channel.stream_id}`}
                                            className="p-4 bg-primary/10 rounded-xl text-center text-xl flex flex-col items-center text-secondary"
                                        >
                                            <img
                                                src={channel.stream_icon || "https://picsum.photos/200/300"} 
                                                alt={channel.name} 
                                                className="rounded-xl mb-4"
                                                style={{ maxWidth: '80px', maxHeight: '80px', objectFit: 'cover' }} 
                                            />
                                            <h3 className="text-lg font-semibold">{channel.name}</h3>
                                            <p className="text-sm">{selectedCategory.category_name}</p>
                                        </Link>
                                    ))}
                                </div>
                            )}
                        </>
                    ) : (
                        <p className="text-xl text-center mb-6">Select a category to explore</p> 
                    )}
                </div>    
            </div>
        </div>
    );
}
