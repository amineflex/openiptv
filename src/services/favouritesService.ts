import type { FavouriteItem, FavouriteType } from "../types";

const STORAGE_KEY = "favourites";

function isFavouriteItem(value: unknown): value is FavouriteItem {
	if (!value || typeof value !== "object") return false;

	const item = value as Partial<FavouriteItem>;
	return (
		typeof item.id === "string" &&
		(item.type === "movie" || item.type === "series") &&
		typeof item.title === "string" &&
		typeof item.route === "string" &&
		typeof item.addedAt === "string"
	);
}

function readFavourites(): FavouriteItem[] {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return [];

		const parsed = JSON.parse(raw);
		return Array.isArray(parsed) ? parsed.filter(isFavouriteItem) : [];
	} catch {
		return [];
	}
}

function writeFavourites(items: FavouriteItem[]): void {
	localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function getFavouriteKey(type: FavouriteType, id: string): string {
	return `${type}:${id}`;
}

export const favouritesService = {
	getAll(): FavouriteItem[] {
		return readFavourites();
	},

	isFavourite(type: FavouriteType, id: string): boolean {
		const key = getFavouriteKey(type, id);
		return readFavourites().some((item) => getFavouriteKey(item.type, item.id) === key);
	},

	toggle(item: Omit<FavouriteItem, "addedAt">): boolean {
		const key = getFavouriteKey(item.type, item.id);
		const favourites = readFavourites();
		const exists = favourites.some((favourite) => getFavouriteKey(favourite.type, favourite.id) === key);

		if (exists) {
			writeFavourites(favourites.filter((favourite) => getFavouriteKey(favourite.type, favourite.id) !== key));
			return false;
		}

		writeFavourites([
			...favourites,
			{
				...item,
				addedAt: new Date().toISOString()
			}
		]);
		return true;
	}
};
