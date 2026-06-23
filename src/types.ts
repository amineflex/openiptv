export type StreamFormat = "ts" | "m3u8";
export type HourFormat = "24H" | "12H";
export type ContentType = "live_tv" | "vod";
export type SelectedCategoryKey =
	| "SELECTED_CATEGORY"
	| "SELECTED_VOD_CATEGORY"
	| "SELECTED_SERIE_CATEGORY";

export interface StreamSettings {
	streamFormat: StreamFormat;
	adultChannel: boolean;
	hourFormat: HourFormat;
	maxChannelsPerCategory: number;
	maxVodPerPage: number;
}

export interface IptvStream {
	id: string;
	name: string;
	domain: string;
	username: string;
	password: string;
	datetime_added?: string;
	expDate?: string | number | null;
	settings: StreamSettings;
}

export interface StreamInfo {
	user_info?: {
		exp_date?: string | number | null;
		status?: string;
		active_cons?: string | number;
		max_connections?: string | number;
	};
	server_info?: Record<string, unknown>;
}

export type StreamCredentials = Pick<IptvStream, "domain" | "username" | "password">;
export type StreamInput = Pick<IptvStream, "name" | "domain" | "username" | "password">;

export interface Category {
	id?: string | number;
	category_id: string;
	category_name: string;
	parent_id?: string | number;
}

export interface LiveChannel {
	num?: string | number;
	name: string;
	stream_id: string | number;
	stream_icon?: string;
}

export interface VodStream {
	name: string;
	stream_id: string | number;
	stream_icon?: string;
	rating?: string | number;
	container_extension?: string;
}

export interface SeriesItem {
	name: string;
	series_id: string | number;
	cover?: string;
	rating_5based?: string | number;
}

export interface SeriesEpisode {
	id: string | number;
	episode_num?: string | number;
	title?: string;
	container_extension?: string;
	subtitles?: unknown;
	subtitle?: unknown;
	info?: {
		movie_image?: string;
		plot?: string;
		duration?: string;
		duration_secs?: string | number;
		rating?: string | number;
		releasedate?: string;
		subtitles?: unknown;
		subtitle?: unknown;
	};
}

export interface SeriesInfo {
	info?: {
		name?: string;
		cover?: string;
		plot?: string;
		genre?: string;
		rating?: string | number;
		releaseDate?: string;
		releasedate?: string;
	};
	episodes?: Record<string, SeriesEpisode[]>;
}

export interface VodInfo {
	info?: {
		name?: string;
		cover_big?: string;
		movie_image?: string;
		backdrop_path?: string[] | string;
		genre?: string;
		plot?: string;
		rating?: string | number;
		releasedate?: string;
		subtitles?: unknown;
		subtitle?: unknown;
	};
	movie_data?: {
		stream_id?: string | number;
		container_extension?: string;
		subtitles?: unknown;
		subtitle?: unknown;
	};
	subtitles?: unknown;
	subtitle?: unknown;
}

export interface ChannelInfo {
	type: ContentType;
	name: string;
	category: string;
	icon: string;
}

export interface SubtitleTrack {
	id: string;
	label: string;
	language: string;
	src: string;
}

export interface EmbeddedSubtitleTrack {
	id: string;
	index: number;
	codec: string;
	label: string;
	language: string;
}

export interface EmbeddedSubtitleListResult {
	ok: boolean;
	tracks: EmbeddedSubtitleTrack[];
	error?: string;
}

export interface EmbeddedSubtitleExtractResult {
	ok: boolean;
	vtt?: string;
	error?: string;
}

export interface PlayableStreamResult {
	ok: boolean;
	url: string;
	transcoded: boolean;
	audioCodecs: string[];
	durationSeconds?: number;
	error?: string;
}

export type FavouriteType = "movie" | "series";

export interface FavouriteItem {
	id: string;
	type: FavouriteType;
	title: string;
	image?: string;
	subtitle?: string;
	route: string;
	addedAt: string;
}

export interface WatchNextEpisode {
	title: string;
	route: string;
	image?: string;
	subtitles?: SubtitleTrack[];
	nextEpisode?: WatchNextEpisode;
}
