import React from "react";
import { useParams, Link } from 'react-router-dom';
import { ArrowUturnLeftIcon } from "@heroicons/react/24/outline";
import { useStreamLoader } from '../hooks/useStreamLoader';
import NotFound from '../components/NotFound';

export default function Menu() {
    const { id } = useParams();
    const stream = useStreamLoader(id);

    if (!stream) {
        return <NotFound message="Stream not found" />;
    }

    return (
        <div className="bg-dark text-secondary min-h-screen px-8">
            <header className="w-full px-4 py-8 bg-primary/20 rounded-b-xl text-secondary top-0">
                <div className="flex flex-col md:flex-row justify-between">
                    <h1 className="text-xl font-bold">Hey, {stream.name} 👋</h1>
                    <nav>
                        <Link to="settings" className="mr-4">Settings</Link>
                        <Link to="/" className="mr-4">Back to home</Link>
                        <span id="hour">18:04</span>
                    </nav>
                </div>
            </header>

            <section className="container mx-auto px-4 py-12">
                <div className="grid grid-cols-3 gap-4">
                    <Link to={`tv`} className="h-96 bg-secondary rounded-xl text-center text-xl justify-center flex items-center text-dark">
                        Live TV
                    </Link>
                    <div className="h-96 bg-blue-400 rounded-xl text-center text-xl justify-center flex items-center">
                        Movies
                    </div>
                    <div className="h-96 bg-orange-400 rounded-xl text-center text-xl justify-center flex items-center">
                        Series 
                    </div>
                    <div className="h-32 bg-indigo-400 rounded-xl col-span-2 text-center text-xl justify-center flex items-center">
                        Connected as {stream.username}
                    </div>
                    <Link to="/" className="h-32 bg-purple-400 rounded-xl text-center text-xl justify-center flex items-center">
                        <ArrowUturnLeftIcon className="h-8 w-8 mr-2" />
                        Back to Home
                    </Link>
                </div>
            </section>
        </div>
    );
}
