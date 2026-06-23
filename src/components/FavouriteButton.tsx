import { useEffect, useState } from "react";
import { HeartIcon } from "@heroicons/react/24/outline";
import { HeartIcon as HeartSolidIcon } from "@heroicons/react/24/solid";
import { favouritesService } from "../services/favouritesService";
import type { FavouriteItem } from "../types";

interface FavouriteButtonProps {
	item: Omit<FavouriteItem, "addedAt">;
}

export default function FavouriteButton({ item }: FavouriteButtonProps) {
	const [isFavourite, setIsFavourite] = useState(false);

	useEffect(() => {
		setIsFavourite(favouritesService.isFavourite(item.type, item.id));
	}, [item.id, item.type]);

	const toggleFavourite = () => {
		setIsFavourite(favouritesService.toggle(item));
	};

	const Icon = isFavourite ? HeartSolidIcon : HeartIcon;

	return (
		<button
			type="button"
			onClick={toggleFavourite}
			className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold transition ${isFavourite ? "bg-secondary-400 text-dark hover:bg-secondary" : "bg-primary/20 text-secondary hover:bg-primary/40"}`}
		>
			<Icon className="h-5 w-5" />
			{isFavourite ? "In favourites" : "Add favourite"}
		</button>
	);
}
