import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("openIptv", {
	listEmbeddedSubtitles: (streamUrl: string) =>
		ipcRenderer.invoke("subtitle:list-embedded", streamUrl),

	extractEmbeddedSubtitle: (streamUrl: string, streamIndex: number) =>
		ipcRenderer.invoke("subtitle:extract-embedded", streamUrl, streamIndex),

	resolvePlayableStream: (streamUrl: string) =>
		ipcRenderer.invoke("media:resolve-playable-stream", streamUrl),

	probeStreamInfo: (streamUrl: string) =>
		ipcRenderer.invoke("media:probe-stream-info", streamUrl)
});
