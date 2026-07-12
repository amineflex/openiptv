import type { ReactNode } from "react";
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
	/** Secondary line under the title (e.g. an episode or category name). */
	subtitle?: string;
	/** Small chip pinned to the top-left corner (e.g. content type). */
	badge?: ReactNode;
	/** Overlay controls pinned to the top-right corner, outside the link. */
	actions?: ReactNode;
}

export default function PosterCard({
	to,
	title,
	image,
	rating,
	ratingScale = 10,
	subtitle,
	badge,
	actions
}: PosterCardProps) {
	return (
		<div className="group relative h-[300px] w-[200px] transition-all duration-500 hover:-translate-y-2">
			<Link
				to={to}
				className="glass relative block h-full w-full overflow-hidden rounded-2xl transition duration-500 group-hover:border-secondary-400/60 group-hover:shadow-2xl group-hover:shadow-secondary-400/40"
			>
				<img
					src={image || PLACEHOLDER_POSTER}
					alt={title}
					loading="lazy"
					onError={(e) => {
						(e.currentTarget as HTMLImageElement).src = PLACEHOLDER_POSTER;
					}}
					className="h-full w-full object-cover transition duration-700 group-hover:scale-110 group-hover:opacity-80"
				/>

				{badge && (
					<span className="absolute left-2 top-2 z-10 inline-flex items-center gap-1 rounded-full bg-dark/70 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-secondary-400 backdrop-blur">
						{badge}
					</span>
				)}

				<div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-[#0b0a17] via-[#0b0a17]/60 to-transparent p-4 opacity-90 transition-opacity duration-300 group-hover:opacity-100">
					<h2 className="line-clamp-2 text-sm font-bold text-white">{title}</h2>
					{subtitle && <p className="line-clamp-1 text-xs text-secondary-700">{subtitle}</p>}
					<div className="mt-1">
						<StarRating value={rating} scale={ratingScale} />
					</div>
				</div>

				<div className="absolute inset-0 flex items-center justify-center opacity-0 transition duration-300 group-hover:opacity-100">
					<span className="glass-panel flex h-14 w-14 items-center justify-center rounded-full bg-secondary-400/80 text-white shadow-xl transition-all duration-300 group-hover:scale-110 group-hover:bg-secondary-400 group-hover:text-dark animate-scale-in">
						<PlayIcon className="ml-0.5 h-7 w-7" />
					</span>
				</div>
			</Link>

			{actions && <div className="absolute right-2 top-2 z-20">{actions}</div>}
		</div>
	);
}
