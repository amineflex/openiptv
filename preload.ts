import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("openIptv", {
	listEmbeddedSubtitles: (streamUrl: string) =>
		ipcRenderer.invoke("subtitle:list-embedded", streamUrl),

	extractEmbeddedSubtitle: (streamUrl: string, streamIndex: number) =>
		ipcRenderer.invoke("subtitle:extract-embedded", streamUrl, streamIndex),

	extractEmbeddedSubtitleWindow: (
		streamUrl: string,
		streamIndex: number,
		relativeIndex: number | undefined,
		startSeconds: number,
		durationSeconds: number
	) => ipcRenderer.invoke(
		"subtitle:extract-embedded-window",
		streamUrl,
		streamIndex,
		relativeIndex,
		startSeconds,
		durationSeconds
	),

	resolvePlayableStream: (streamUrl: string) =>
		ipcRenderer.invoke("media:resolve-playable-stream", streamUrl),

	createStreamProxy: (streamUrl: string) =>
		ipcRenderer.invoke("media:create-stream-proxy", streamUrl),

	releaseStreamProxy: (proxyId: string) =>
		ipcRenderer.invoke("media:release-stream-proxy", proxyId),

	probeStreamInfo: (streamUrl: string) =>
		ipcRenderer.invoke("media:probe-stream-info", streamUrl),

	stopTranscoding: () =>
		ipcRenderer.invoke("media:stop-transcoding"),

	getAppUsageStats: () =>
		ipcRenderer.invoke("stats:get-app-usage"),

	getSystemStats: () =>
		ipcRenderer.invoke("stats:get-system"),

	// Static — read once. process.platform/arch are available even in a
	// sandboxed preload; Node builtins like "os" are NOT (they crash the
	// whole preload and wipe out window.openIptv), so don't import them here.
	platformInfo: {
		arch: process.arch,
		platform: process.platform
	}
});
