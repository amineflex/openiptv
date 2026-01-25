import { ArrowLeftIcon, ChevronDownIcon, EllipsisVerticalIcon, Cog6ToothIcon } from "@heroicons/react/24/outline";
import React, { useEffect, useRef, useState } from "react";
import { Select, Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import clsx from 'clsx';

export default function Player({ streamUrl, channelInfo }) {
    const videoRef = useRef(null);
    const [isHovered, setIsHovered] = useState(false);
    const [audioTracks, setAudioTracks] = useState([]);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false); 

    useEffect(() => {
        if (videoRef.current && channelInfo.type === "vod") {
            videoRef.current.src = streamUrl;
            videoRef.current.play();

            const handleMetadata = () => {
                const tracks = videoRef.current.audioTracks;
				console.log(tracks);
                if (tracks) {
                    const tracksArray = Array.from(tracks);
                    setAudioTracks(tracksArray);
                    const activeIndex = tracksArray.findIndex(t => t.enabled);
                    setSelectedIndex(activeIndex !== -1 ? activeIndex : 0);
                }
            };

            videoRef.current.addEventListener("loadedmetadata", handleMetadata);
            return () => videoRef.current?.removeEventListener("loadedmetadata", handleMetadata);
        }
    }, [streamUrl, channelInfo.type]);

    const handleAudioChange = (e) => {
        const index = parseInt(e.target.value);
        const tracks = videoRef.current.audioTracks;
        if (tracks) {
            for (let i = 0; i < tracks.length; i++) {
                tracks[i].enabled = (i === index);
            }
            setSelectedIndex(index);
            setAudioTracks(Array.from(tracks));
        }
    };

    return (
        <div
            className="relative bg-black text-secondary min-h-screen flex items-center justify-center overflow-hidden"
            onMouseMove={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            {isHovered && (
                <div className="absolute top-4 left-4 right-4 flex justify-between z-40 items-start">
                    <div className="bg-dark/75 p-4 rounded-lg flex items-center space-x-4">
                        <button onClick={() => history.back()} className="p-2 hover:bg-primary/30 rounded-full transition">
                            <ArrowLeftIcon className="h-6 w-6 text-white" />
                        </button>
                        <h3 className="text-lg font-semibold text-white">{channelInfo.name}</h3>
                    </div>

                        <button onClick={() => setIsSettingsOpen(true)} className="p-3 bg-dark/75 rounded-lg text-white hover:bg-primary/30 transition">
                            <EllipsisVerticalIcon className="h-6 w-6"  />
                        </button>
                </div>
            )}

            {/* Settings popup */}
            <Dialog open={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} className="relative z-[60]">
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" aria-hidden="true" />
                <div className="fixed inset-0 flex items-stretch justify-end">
                    <DialogPanel className="w-full h-full max-w-sm rounded-l-2xl bg-gray-900 p-6 border border-white/10">
                        <DialogTitle className="text-xl font-bold text-white mb-6 flex items-center tracking-tight">
                            <Cog6ToothIcon className="h-6 w-6 mr-2 text-primary" />
                             Player Settings
                        </DialogTitle>

                        <div className="space-y-6">
                            {/* Audio Tracks */}
                            <div>
                                <label className="text-xs font-bold uppercase text-gray-400 mb-2 block">Audio Track</label>
                                {audioTracks.length > 0 ? (
                                    <div className="relative">
                                        <Select
                                            value={selectedIndex}
                                            onChange={handleAudioChange}
                                            className="block w-full appearance-none rounded-lg bg-white/5 py-2.5 px-4 text-sm text-white focus:outline-none border border-white/10"
                                        >
                                            {audioTracks.map((track, i) => (
                                                <option key={i} value={i} className="bg-gray-900">
                                                    {track.language?.toUpperCase() || `Piste ${i + 1}`} {track.label ? `- ${track.label}` : ''}
                                                </option>
                                            ))}
                                        </Select>
                                        <ChevronDownIcon className="pointer-events-none absolute top-3 right-3 size-4 text-white/50" />
                                    </div>
                                ) : (
                                    <div className="p-3 bg-white/5 rounded-lg border border-dashed border-white/10 text-center text-sm text-gray-500">
										No tracks available
									</div>
                                )}
                            </div>

                            {/*Subtitles */}
                            <div>
                                <label className="text-xs font-bold uppercase text-gray-400 mb-2 block">Subtitles</label>
                                <div className="p-3 bg-white/5 rounded-lg border border-dashed border-white/10 text-center text-sm text-gray-500">
                                    Coming soon...
                                </div>
                            </div>
                        </div>

                        <div className="mt-8">
                            <button
                                onClick={() => setIsSettingsOpen(false)}
                                className="w-full py-2 bg-primary text-white rounded-xl font-bold hover:bg-primary/80 transition"
                            >
                                Apply 
                            </button>
                        </div>
                    </DialogPanel>
                </div>
            </Dialog>

            <video
                ref={videoRef}
                controls
                className={clsx("w-full h-full", channelInfo.type === "live_tv" && "live_tv")}
            />
        </div>
    );
}