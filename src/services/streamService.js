import mpegts from "mpegts.js";

export function generateStreamUrl(domain, type, username, password, channelId, containerExtension) {
  const url =  `${domain}/${type}/${username}/${password}/${channelId}.${containerExtension}`;
  console.log(url);
  return url
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
