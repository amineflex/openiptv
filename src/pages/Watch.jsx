import React from "react";
import { useLocation } from "react-router-dom";
import Player from "../components/Player";

export default function Watch() {
	const location = useLocation();

	const queryParams = new URLSearchParams(location.search);
	const streamUrl = queryParams.get("src");
	const channelInfo = {
		name: queryParams.get("channel"),
		category: queryParams.get("category"),
		icon: queryParams.get("icon")
	};

	return <Player streamUrl={streamUrl} channelInfo={channelInfo} />;
}
