import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import Player from "../components/Player";
import LivePlayer from "../components/LivePlayer";
import { historyService } from "../services/historyService";
import type { ChannelSwitcherItem, ContentType, GuideCategoryItem, HistoryItem, SubtitleTrack, WatchNextEpisode } from "../types";

// Every play route is /menu/{streamId}/... — pull the profile id back out so
// history can be scoped per profile even when it isn't passed explicitly.
function parseStreamId(route?: string): string | null {
	if (!route) return null;
	const match = route.match(/\/menu\/([^/]+)/);
	return match ? match[1] : null;
}

interface WatchState {
	subtitles?: SubtitleTrack[];
	nextEpisode?: WatchNextEpisode;
	channels?: ChannelSwitcherItem[];
	categories?: GuideCategoryItem[];
	selectedCategoryId?: string;
	profileId?: string;
	backTo?: string;
	backLabel?: string;
	resumeTime?: number;
}

export default function Watch() {
	const location = useLocation();
	const state = location.state as WatchState | null;

	const params = new URLSearchParams(location.search);
	const streamUrl = params.get("src");
	const type = (params.get("type") ?? "vod") as ContentType;
	const streamId = state?.profileId ?? parseStreamId(state?.backTo);

	const channelInfo = {
		type,
		name: params.get("channel") ?? "",
		category: params.get("category") ?? "",
		icon: params.get("icon") ?? ""
	};

	useEffect(() => {
		const title = channelInfo.name.trim();
		document.title = title ? `OpenIPTV | ${title}` : "OpenIPTV";

		return () => {
			document.title = "OpenIPTV";
		};
	}, [channelInfo.name]);

	// Record the watched item in the per-profile history. Deps are the primitive
	// fields (not the rebuilt channelInfo object) so it fires once per navigation
	// — including channel zapping, which re-navigates here with new params.
	useEffect(() => {
		if (!streamUrl) return;
		if (!streamId) return;

		const watchUrl = `${location.pathname}${location.search}`;
		let entry: Omit<HistoryItem, "watchedAt">;

		if (type === "live_tv") {
			entry = {
				key: `live:${streamUrl}`,
				streamId,
				type: "live",
				title: channelInfo.name || "Live channel",
				subtitle: channelInfo.category || undefined,
				image: channelInfo.icon || undefined,
				route: watchUrl
			};
		} else {
			// VOD: the detail page (backTo) is both the dedup key and the click
			// target, so a movie/series collapses to a single "continue watching"
			// entry. For series the channel param is the episode label and the
			// category is the show title — swap them so the card leads with the show.
			const backTo = state?.backTo ?? "";
			const isSeries = backTo.includes("/series/");
			entry = {
				key: backTo || `vod:${streamUrl}`,
				streamId,
				type: isSeries ? "series" : "movie",
				title: (isSeries ? channelInfo.category : channelInfo.name) || channelInfo.name || "Untitled",
				subtitle: (isSeries ? channelInfo.name : channelInfo.category) || undefined,
				image: channelInfo.icon || undefined,
				route: backTo || watchUrl
			};
		}

		historyService.record(entry);
	}, [streamUrl, streamId, type, channelInfo.name, channelInfo.category, channelInfo.icon, state?.backTo, location.pathname, location.search]);

	if (channelInfo.type === "live_tv") {
		return (
			<LivePlayer
				streamUrl={streamUrl}
				channelInfo={channelInfo}
				channels={state?.channels ?? []}
				categories={state?.categories ?? []}
				selectedCategoryId={state?.selectedCategoryId ?? ""}
				profileId={state?.profileId}
				backTo={state?.backTo}
				backLabel={state?.backLabel}
			/>
		);
	}

	return (
		<Player
			streamUrl={streamUrl}
			channelInfo={{ ...channelInfo, type: "vod" }}
			subtitles={state?.subtitles ?? []}
			nextEpisode={state?.nextEpisode}
			backTo={state?.backTo}
			backLabel={state?.backLabel}
			streamId={streamId ?? undefined}
			resumeTime={state?.resumeTime}
		/>
	);
}
