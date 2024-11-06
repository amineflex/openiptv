import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useParams } from "react-router-dom";
import { apiService } from "../services/apiService";
import { useStreamLoader } from "../hooks/useStreamLoader"; 
import { generateStreamUrl } from "../services/streamService";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";


export default function Movie() {
  const { id, movieId } = useParams();
  const stream = useStreamLoader(id); 
  const [movieInfo, setMovieInfo] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMovieInfo = async () => {
      if (!stream) return;

      setLoading(true);
      
      const data = await apiService.fetchVodInfo(stream, movieId);
      setMovieInfo(data);
      setLoading(false);
    };

    fetchMovieInfo();
  }, [movieId, stream]);

  if (loading) {
    return <p>Loading movie info...</p>;
  }

  if (!movieInfo) {
    return <p>Failed to load movie info.</p>;
  }
return (
    <div className="bg-dark text-secondary min-h-screen">
        <div className="container mx-auto">
            <div 
            className="bg-black rounded-xl h-64 mb-4"
            style={{
                backgroundImage: `url(${movieInfo.info.backdrop_path[0]})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
            }}
            >
                <div className="bg-black/60 h-full w-full backdrop-blur	p-4">
                    <div className="flex flex-row items-center mb-4 gap-2">
                        <Link
                        to={`/menu/${id}/movies`}
                        className="text-secondary/75 text-sm font-semibold items-center rounded-full bg-primary/10 hover:bg-primary-100 p-2"
                        >
                            <ArrowLeftIcon className="h-6 w-6 text-secondary-400 " />
                        </Link>
                    </div>
                </div>

            </div>
            <header className="flex flex-row md:max-w-4xl mx-auto pb-10 gap-6">
                <div className="flex justify-center flex-col items-center gap-2 z-50">
                    <img src={movieInfo.info.cover_big} alt={movieInfo.info.name} className="max-w-full min-w-64 h-auto rounded-b-lg shadow-lg rounded-lg -mt-48" />
                    <button className="bg-primary/20 hover:bg-primary/40 text-white p-2 rounded-lg text-lg font-semibold text-center w-full">Show Trailer</button>
                </div>
                <div>
                    <h1 className="text-4xl font-bold text-white mb-4">{movieInfo.info.name || "Movie"}</h1>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="md:col-span-2 gap-2 flex flex-col">
                            <p className="text-lg">#{movieId}</p>
                            <p className="text-lg"> {movieInfo.info.plot}</p>
                            <p className="text-md">
                                 {movieInfo.info.genre.split(", ").map((genre, index) => (
                                    <span key={index} className="bg-secondary-400/25 text-secondary-400 py-1 px-2 rounded-xl mr-2">{genre}</span>
                                ))
                                 }
                                </p>
                            <p className="text-lg"><strong>Rating:</strong> {movieInfo.info.rating}</p>
                            <p className="text-lg"><strong>Release Date:</strong> {movieInfo.info.releasedate}</p>
                        </div>
                    </div>
                </div>
            </header>

            <Link  to={`/watch?src=${generateStreamUrl(stream.domain, "movie", stream.username, stream.password, movieId, movieInfo.movie_data.container_extension)}&type=vod&channel=${movieInfo.info.name}&category=${movieInfo.info.genre}&icon=${movieInfo.info.movie_image}`} className="mt-5 bg-primary text-white p-2 rounded-lg text-lg font-semibold text-center">
                Watch Now
            </Link>
        </div>
    </div>
);
}
