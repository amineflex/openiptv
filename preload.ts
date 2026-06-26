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

	resolveLiveStream: (streamUrl: string) =>
		ipcRenderer.invoke("media:resolve-live-stream", streamUrl),

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

	getFfmpegStats: () =>
		ipcRenderer.invoke("stats:get-ffmpeg"),

	// ── Auto-updater ────────────────────────────────────────────────────────────
	// Listen for update lifecycle events forwarded from the main process.
	// Callbacks are registered once at mount; the returned cleanup function
	// removes the listener (call it from useEffect's return value).
	onUpdateAvailable: (cb: () => void) => {
		const handler = () => cb();
		ipcRenderer.on("updater:available", handler);
		return () => ipcRenderer.removeListener("updater:available", handler);
	},

	onUpdateDownloaded: (cb: (info: { releaseName: string; releaseNotes?: string }) => void) => {
		const handler = (_e: Electron.IpcRendererEvent, info: { releaseName: string; releaseNotes?: string }) => cb(info);
		ipcRenderer.on("updater:downloaded", handler);
		return () => ipcRenderer.removeListener("updater:downloaded", handler);
	},

	installUpdate: () =>
		ipcRenderer.invoke("updater:quit-and-install"),

	// ── Downloads (offline, Netflix-style) ───────────────────────────────────────
	// Media is fetched by the main process into <userData>/Downloads. The renderer
	// drives it through these invokes and subscribes to progress/changed/removed
	// events; every listener returns a cleanup function (call from useEffect).
	downloads: {
		list: () => ipcRenderer.invoke("downloads:list"),
		start: (input: unknown) => ipcRenderer.invoke("downloads:start", input),
		cancel: (id: string) => ipcRenderer.invoke("downloads:cancel", id),
		remove: (id: string) => ipcRenderer.invoke("downloads:delete", id),
		openFile: (id: string) => ipcRenderer.invoke("downloads:open-file", id),
		playback: (id: string) => ipcRenderer.invoke("downloads:playback", id),
		reveal: (id: string) => ipcRenderer.invoke("downloads:reveal", id),
		openFolder: () => ipcRenderer.invoke("downloads:open-folder"),

		onProgress: (cb: (progress: unknown) => void) => {
			const handler = (_e: Electron.IpcRendererEvent, progress: unknown) => cb(progress);
			ipcRenderer.on("downloads:progress", handler);
			return () => ipcRenderer.removeListener("downloads:progress", handler);
		},
		onChanged: (cb: (record: unknown) => void) => {
			const handler = (_e: Electron.IpcRendererEvent, record: unknown) => cb(record);
			ipcRenderer.on("downloads:changed", handler);
			return () => ipcRenderer.removeListener("downloads:changed", handler);
		},
		onRemoved: (cb: (payload: { id: string }) => void) => {
			const handler = (_e: Electron.IpcRendererEvent, payload: { id: string }) => cb(payload);
			ipcRenderer.on("downloads:removed", handler);
			return () => ipcRenderer.removeListener("downloads:removed", handler);
		}
	},

	// Static — read once. process.platform/arch are available even in a
	// sandboxed preload; Node builtins like "os" are NOT (they crash the
	// whole preload and wipe out window.openIptv), so don't import them here.
	platformInfo: {
		arch: process.arch,
		platform: process.platform
	}
});

