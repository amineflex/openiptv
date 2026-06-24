import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import Player from "../components/Player";
import LivePlayer from "../components/LivePlayer";
import type { ChannelSwitcherItem, ContentType, GuideCategoryItem, SubtitleTrack, WatchNextEpisode } from "../types";

interface WatchState {
	subtitles?: SubtitleTrack[];
	nextEpisode?: WatchNextEpisode;
	channels?: ChannelSwitcherItem[];
	categories?: GuideCategoryItem[];
	selectedCategoryId?: string;
	profileId?: string;
	backTo?: string;
	backLabel?: string;
}

export default function Watch() {
	const location = useLocation();
	const state = location.state as WatchState | null;

	const params = new URLSearchParams(location.search);
	const streamUrl = params.get("src");
	const type = (params.get("type") ?? "vod") as ContentType;

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
		/>
	);
}
