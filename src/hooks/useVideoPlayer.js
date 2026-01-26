import { useEffect, useState } from "react";

export function useVideoPlayer(videoRef, streamUrl, type) {
    const [audioTracks, setAudioTracks] = useState([]);
    const [selectedIndex, setSelectedIndex] = useState(0);

    useEffect(() => {
        const video = videoRef.current;
        if (video && type === "vod") {
            video.src = streamUrl;
            video.play();

            const handleMetadata = () => {
                const tracks = video.audioTracks;
                if (tracks) {
                    const tracksArray = Array.from(tracks);
                    setAudioTracks(tracksArray);
                    const activeIndex = tracksArray.findIndex(t => t.enabled);
                    setSelectedIndex(activeIndex !== -1 ? activeIndex : 0);
                }
            };

            video.addEventListener("loadedmetadata", handleMetadata);
            return () => video.removeEventListener("loadedmetadata", handleMetadata);
        }
    }, [streamUrl, type, videoRef]);

    const changeAudioTrack = (index) => {
        const tracks = videoRef.current?.audioTracks;
        if (tracks) {
            for (let i = 0; i < tracks.length; i++) {
                tracks[i].enabled = (i === index);
            }
            setSelectedIndex(index);
            setAudioTracks(Array.from(tracks));
        }
    };

    return { audioTracks, selectedIndex, changeAudioTrack };
}