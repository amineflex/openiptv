import { useState, useEffect } from 'react';

export const useStreamLoader = (id) => {
    const [stream, setStream] = useState(null);

    useEffect(() => {
        const storedStreams = JSON.parse(localStorage.getItem("streams")) || [];
        const selectedStream = storedStreams[id];
        setStream(selectedStream);
    }, [id]);

    return stream;
};