import { ArrowLeftIcon, ChevronDownIcon, EllipsisVerticalIcon, Cog6ToothIcon } from "@heroicons/react/24/outline";
import React, { useRef, useState } from "react";
import { Select, Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import clsx from 'clsx';
import { useVideoPlayer } from "../hooks/useVideoPlayer";

export default function Player({ streamUrl, channelInfo }) {
    const videoRef = useRef(null);
    const [isHovered, setIsHovered] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false); 

    // On appelle notre nouveau hook
    const { audioTracks, selectedIndex, changeAudioTrack } = useVideoPlayer(
        videoRef, 
        streamUrl, 
        channelInfo.type
    );

    return (
        <div
            className="relative bg-black text-secondary min-h-screen flex items-center justify-center overflow-hidden"
            onMouseMove={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            {/* Header & Controls */}
            {isHovered && (
                <div className="absolute top-4 left-4 right-4 flex justify-between z-40 items-start">
                    <div className="bg-dark/75 p-4 rounded-lg flex items-center space-x-4">
                        <button onClick={() => history.back()} className="p-2 hover:bg-primary/30 rounded-full transition">
                            <ArrowLeftIcon className="h-6 w-6 text-white" />
                        </button>
                        <h3 className="text-lg font-semibold text-white">{channelInfo.name}</h3>
                    </div>
                    <button onClick={() => setIsSettingsOpen(true)} className="p-3 bg-dark/75 rounded-lg text-white hover:bg-primary/30 transition">
                        <EllipsisVerticalIcon className="h-6 w-6" />
                    </button>
                </div>
            )}

            {/* Settings Dialog (Headless UI) */}
            <Dialog open={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} className="relative z-[60]">
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" />
                <div className="fixed inset-0 flex items-stretch justify-end">
                    <DialogPanel className="w-full h-full max-w-sm bg-gray-900 p-6 border-l border-white/10">
                        <DialogTitle className="text-xl font-bold text-white mb-6 flex items-center">
                            <Cog6ToothIcon className="h-6 w-6 mr-2 text-primary" />
                             Settings
                        </DialogTitle>

                        <div className="space-y-6">
                            <div>
                                <label className="text-xs font-bold uppercase text-gray-400 mb-2 block">Audio Track</label>
                                {audioTracks.length > 0 ? (
                                    <div className="relative">
                                        <Select
                                            value={selectedIndex}
                                            onChange={(e) => changeAudioTrack(parseInt(e.target.value))}
                                            className="block w-full rounded-lg bg-white/5 py-2.5 px-4 text-sm text-white focus:outline-none border border-white/10"
                                        >
                                            {audioTracks.map((track, i) => (
                                                <option key={i} value={i} className="bg-gray-900">
                                                    {track.language?.toUpperCase() || `Track ${i + 1}`} {track.label ? `- ${track.label}` : ''}
                                                </option>
                                            ))}
                                        </Select>
                                        <ChevronDownIcon className="absolute top-3 right-3 size-4 text-white/50" />
                                    </div>
                                ) : (
                                    <div className="p-3 bg-white/5 rounded-lg border border-dashed border-white/10 text-center text-sm text-gray-500">
                                        No tracks available
                                    </div>
                                )}
                            </div>
                        </div>

                        <button onClick={() => setIsSettingsOpen(false)} className="mt-8 w-full py-2 bg-primary text-white rounded-xl font-bold">
                            Apply
                        </button>
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