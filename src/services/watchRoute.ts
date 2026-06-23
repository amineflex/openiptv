import type { ContentType } from "../types";

interface WatchRouteParams {
	src: string;
	type: ContentType;
	channel?: string;
	icon?: string;
	category?: string;
}

export function buildWatchRoute({ src, type, channel, icon, category }: WatchRouteParams): string {
	const params = new URLSearchParams({ src, type });
	if (channel) params.set("channel", channel);
	if (icon) params.set("icon", icon);
	if (category) params.set("category", category);
	return `/watch?${params.toString()}`;
}
