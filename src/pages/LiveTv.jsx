import React from 'react';
import { useParams } from 'react-router-dom';
import { useStreamLoader } from '../hooks/useStreamLoader';
import { useLiveCategories } from '../hooks/useLiveCategories';
import NotFound from '../components/NotFound';

export default function LiveTv() {
    const { id } = useParams();
    const stream = useStreamLoader(id);
    const categories = useLiveCategories(stream);

    if (!stream) {
        return <NotFound message="Stream not found" />;
    }

    return (
 
        <div className="bg-dark text-secondary min-h-screen px-8">
            
        </div>
    );
}
