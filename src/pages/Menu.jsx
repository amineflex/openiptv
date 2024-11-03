import React, { useState, useEffect } from "react";
import { useParams, Link } from 'react-router-dom';
import { ArrowUturnLeftIcon, VideoCameraIcon, FilmIcon, TvIcon, Cog6ToothIcon } from "@heroicons/react/24/outline";
import { useStreamLoader } from '../hooks/useStreamLoader';
import NotFound from '../components/NotFound';

export default function Menu() {
    const { id } = useParams();
    const stream = useStreamLoader(id);

    const [currentTime, setCurrentTime] = useState("");

    // Time update
    useEffect(() => {
        const updateClock = () => {
            const now = new Date();
            const hours = now.getHours().toString().padStart(2, "0");
            const minutes = now.getMinutes().toString().padStart(2, "0");
            setCurrentTime(`${hours}:${minutes}`);
        };

        updateClock();

        // Update the time every minute
        const intervalId = setInterval(updateClock, 60000); // 60000 ms = 1 minute

        return () => clearInterval(intervalId); 
    }, []);

    if (!stream) {
        return <NotFound message="Stream not found" />;
    }

    return (
        <div className="bg-dark text-secondary min-h-screen px-8">
            <header className="w-full px-4 py-8 bg-primary/20 rounded-b-xl text-secondary top-0">
                <div className="flex flex-col md:flex-row justify-between">
                    <h1 className="text-xl font-bold">Hey, {stream.name} 👋</h1>
                    <nav className="inline-flex items-center justify-center">
                        <Link to="settings" className="mr-2 flex items-center justify-center p-2 hover:bg-secondary-400/25 rounded-full hover:text-secondary-400">
                            <Cog6ToothIcon className="h-6 w-6" /> 
                        </Link>
                        <span className="mr-4">|</span>
                        <span id="hour">{currentTime}</span> 
                    </nav>
                </div>
            </header>

            <section className="container mx-auto px-4 py-12">
                <div className="grid grid-cols-3 gap-4">
                    <Link to={`tv`} className="h-96 bg-secondary rounded-xl text-center text-xl justify-center flex items-center text-dark">
                        <TvIcon className="h-8 w-8 mr-2" />
                        Live TV
                    </Link>
                    <div className="h-96 bg-blue-400 rounded-xl text-center text-xl justify-center flex items-center">
                        <FilmIcon className="h-8 w-8 mr-2" />
                        Movies
                    </div>
                    <div className="h-96 bg-orange-400 rounded-xl text-center text-xl justify-center flex items-center">
                        <VideoCameraIcon className="h-8 w-8 mr-2" />
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
