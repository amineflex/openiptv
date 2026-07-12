const ADULT_KEYWORDS = ["adult", "18+", "xxx", "erotic", "porn", "x-rated", "18 ", "+18"];

export function isAdultCategory(item: { category_name?: string; name?: string }): boolean {
	const name = (item.category_name ?? item.name ?? "").toLowerCase();
	return ADULT_KEYWORDS.some((keyword) => name.includes(keyword));
}

export function filterAdultItems<T extends { category_name?: string; name?: string }>(
	items: T[],
	adultContentEnabled: boolean,
	categoryName?: string
): T[] {
	if (adultContentEnabled) return items;
	if (categoryName && isAdultCategory({ category_name: categoryName })) return [];
	return items.filter((item) => !isAdultCategory(item));
}
