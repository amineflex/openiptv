"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld("openIptv", {
    listEmbeddedSubtitles: (streamUrl) => electron_1.ipcRenderer.invoke("subtitle:list-embedded", streamUrl),
    extractEmbeddedSubtitle: (streamUrl, streamIndex) => electron_1.ipcRenderer.invoke("subtitle:extract-embedded", streamUrl, streamIndex),
    resolvePlayableStream: (streamUrl) => electron_1.ipcRenderer.invoke("media:resolve-playable-stream", streamUrl),
    probeStreamInfo: (streamUrl) => electron_1.ipcRenderer.invoke("media:probe-stream-info", streamUrl)
});
