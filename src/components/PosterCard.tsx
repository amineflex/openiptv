import { Link } from "react-router-dom";
import { PlayIcon } from "@heroicons/react/24/solid";
import StarRating from "./StarRating";
import { PLACEHOLDER_POSTER } from "../constants";

interface PosterCardProps {
	to: string;
	title: string;
	image?: string;
	rating?: string | number;
	ratingScale?: number;
}

export default function PosterCard({ to, title, image, rating, ratingScale = 10 }: PosterCardProps) {
	return (
		<Link
			to={to}
			className="group relative block h-[300px] w-[200px] overflow-hidden rounded-2xl border border-white/10 bg-primary/10 shadow-lg shadow-black/30 transition duration-300 hover:-translate-y-1 hover:border-secondary-400/60 hover:shadow-xl hover:shadow-secondary-400/20"
		>
			<img
				src={image || PLACEHOLDER_POSTER}
				alt={title}
				loading="lazy"
				onError={(e) => {
					(e.currentTarget as HTMLImageElement).src = PLACEHOLDER_POSTER;
				}}
				className="h-full w-full object-cover transition duration-500 group-hover:scale-110"
			/>

			<div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-dark via-dark/30 to-transparent p-3">
				<h2 className="line-clamp-2 text-sm font-bold text-white">{title}</h2>
				<div className="mt-1">
					<StarRating value={rating} scale={ratingScale} />
				</div>
			</div>

			<div className="absolute inset-0 flex items-center justify-center opacity-0 transition duration-300 group-hover:opacity-100">
				<span className="flex h-14 w-14 items-center justify-center rounded-full bg-secondary-400/90 text-dark shadow-xl shadow-black/40 backdrop-blur transition group-hover:scale-110">
					<PlayIcon className="ml-0.5 h-7 w-7" />
				</span>
			</div>
		</Link>
	);
}
