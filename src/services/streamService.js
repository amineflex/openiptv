import mpegts from "mpegts.js";

export function generateStreamUrl(domain, username, password, channelId) {
  return `${domain}/live/${username}/${password}/${channelId}.ts`;
}

export function startStream(videoElement, streamUrl) {
  if (mpegts.getFeatureList().mseLivePlayback && videoElement) {
    const player = mpegts.createPlayer({
      type: "mpegts",
      url: streamUrl,
    });

    player.attachMediaElement(videoElement);
    player.load();
    player.play();

    return player;
  }
  return null;
}
