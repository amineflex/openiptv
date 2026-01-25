import React from "react";
import { useLocation } from "react-router-dom";
import Player from "../components/Player";
import LivePlayer from "../components/LivePlayer";

export default function Watch() {
	const location = useLocation();

	const queryParams = new URLSearchParams(location.search);
	const streamUrl = queryParams.get("src");
	const channelInfo = {
		type: queryParams.get("type"),
		name: queryParams.get("channel"),
		category: queryParams.get("category"),
		icon: queryParams.get("icon")
	};
	if (channelInfo.type === "live_tv") {
		return <LivePlayer streamUrl={streamUrl} channelInfo={channelInfo} />;
	} else {
		return <Player streamUrl={streamUrl} channelInfo={channelInfo} />;
	}

}
