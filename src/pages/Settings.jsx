import React, { useState, useEffect } from 'react';
import { useParams, Link } from "react-router-dom";

export default function Settings() {
    const { id } = useParams();
    const [stream, setStream] = useState(null);

    useEffect(() => {
        const storedStreams = JSON.parse(localStorage.getItem("streams")) || [];
        const currentStream = storedStreams[id];
        if (currentStream) {
            setStream(currentStream);
        }
    }, [id]);

    const handleSettingsChange = (e) => {
        const { name, value } = e.target;
        setStream((prevStream) => ({
            ...prevStream,
            settings: {
                ...prevStream.settings,
                [name]: value
            }
        }));
    };

    const saveSettings = () => {
        const storedStreams = JSON.parse(localStorage.getItem("streams")) || [];
        storedStreams[id] = stream;
        localStorage.setItem("streams", JSON.stringify(storedStreams));
        alert('Settings saved successfully!');
    };

    if (!stream) {
        return <p>Loading...</p>;
    }

    return (
        <div className='bg-dark text-secondary flex justify-center min-h-screen'>
            <div className='w-full max-w-5xl p-4'>
                <header className='flex justify-between items-center'>
                    <h1 className='text-xl font-bold'>Settings</h1>
                    <Link to={`/menu/${id}`} className='text-secondary hover:text-secondary-400'>
                        <span>Back</span>
                    </Link>
                </header>
                <div className='bg-primary/20 rounded-xl p-4 gap-4 mt-4 flex flex-col'>
                    <div className='flex justify-between'>
                        <div>
                            <h3 className='text-lg font-bold'>Stream format</h3>
                            <p className='text-secondary/60'>Select the format of the stream</p>
                        </div>
                        <div>
                            <select
                                name="streamFormat"
                                className='bg-primary/40 text-secondary w-full p-2 rounded-lg min-w-48'
                                value={stream.settings.streamFormat}
                                onChange={handleSettingsChange}
                            >
                                <option value=".ts">.ts (recommended)</option>
                                <option value=".m3u8">.m3u8</option>
                            </select>
                        </div>
                    </div>

                    <div className='flex justify-between'>
                        <div>
                            <h3 className='text-lg font-bold'>Adult channel</h3>
                            <p className='text-secondary/60'>Enable +18 channels</p>
                        </div>
                        <div>
                            <select
                                name="adultChannel"
                                className='bg-primary/40 text-secondary w-full p-2 rounded-lg min-w-48'
                                value={stream.settings.adultChannel}
                                onChange={handleSettingsChange}
                            >
                                <option value={false}>Disable (default)</option>
                                <option value={true}>Enable</option>
                            </select>
                        </div>
                    </div>

                    <div className='flex justify-between'>
                        <div>
                            <h3 className='text-lg font-bold'>Hour format</h3>
                            <p className='text-secondary/60'>Set to 12 or 24H format</p>
                        </div>
                        <div>
                            <select
                                name="hourFormat"
                                className='bg-primary/40 text-secondary w-full p-2 rounded-lg min-w-48'
                                value={stream.settings.hourFormat}
                                onChange={handleSettingsChange}
                            >
                                <option value="24H">24H (default)</option>
                                <option value="12H">12H</option>
                            </select>
                        </div>
                    </div>

                    <button
                        className='mt-4 bg-dark/40 hover:bg-secondary-400/25 text-white hover:text-secondary-400 py-2 px-4 rounded-lg'
                        onClick={saveSettings}
                    >
                        Save Settings
                    </button>
                </div>
            </div>
        </div>
    );
}
