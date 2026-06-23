import type { FavouriteItem, FavouriteType } from "../types";

const STORAGE_KEY = "favourites";

function getStorageKey(streamId: string): string {
	return `${STORAGE_KEY}:${streamId}`;
}

function isFavouriteItem(value: unknown): value is FavouriteItem {
	if (!value || typeof value !== "object") return false;

	const item = value as Partial<FavouriteItem>;
	return (
		typeof item.id === "string" &&
		typeof item.streamId === "string" &&
		(item.type === "movie" || item.type === "series") &&
		typeof item.title === "string" &&
		typeof item.route === "string" &&
		typeof item.addedAt === "string"
	);
}

function readFavourites(streamId: string): FavouriteItem[] {
	try {
		const raw = localStorage.getItem(getStorageKey(streamId));
		if (!raw) return [];

		const parsed = JSON.parse(raw);
		return Array.isArray(parsed)
			? parsed.filter((item): item is FavouriteItem => isFavouriteItem(item) && item.streamId === streamId)
			: [];
	} catch {
		return [];
	}
}

function writeFavourites(streamId: string, items: FavouriteItem[]): void {
	localStorage.setItem(getStorageKey(streamId), JSON.stringify(items));
}

function getFavouriteKey(type: FavouriteType, id: string): string {
	return `${type}:${id}`;
}

export const favouritesService = {
	getAll(streamId: string): FavouriteItem[] {
		return readFavourites(streamId);
	},

	isFavourite(streamId: string, type: FavouriteType, id: string): boolean {
		const key = getFavouriteKey(type, id);
		return readFavourites(streamId).some((item) => getFavouriteKey(item.type, item.id) === key);
	},

	toggle(item: Omit<FavouriteItem, "addedAt">): boolean {
		const key = getFavouriteKey(item.type, item.id);
		const favourites = readFavourites(item.streamId);
		const exists = favourites.some((favourite) => getFavouriteKey(favourite.type, favourite.id) === key);

		if (exists) {
			writeFavourites(
				item.streamId,
				favourites.filter((favourite) => getFavouriteKey(favourite.type, favourite.id) !== key)
			);
			return false;
		}

		writeFavourites(item.streamId, [
			...favourites,
			{
				...item,
				addedAt: new Date().toISOString()
			}
		]);
		return true;
	}
};
