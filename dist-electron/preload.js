"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld("openIptv", {
    listEmbeddedSubtitles: (streamUrl) => electron_1.ipcRenderer.invoke("subtitle:list-embedded", streamUrl),
    extractEmbeddedSubtitle: (streamUrl, streamIndex) => electron_1.ipcRenderer.invoke("subtitle:extract-embedded", streamUrl, streamIndex),
    extractEmbeddedSubtitleWindow: (streamUrl, streamIndex, relativeIndex, startSeconds, durationSeconds) => electron_1.ipcRenderer.invoke("subtitle:extract-embedded-window", streamUrl, streamIndex, relativeIndex, startSeconds, durationSeconds),
    resolvePlayableStream: (streamUrl) => electron_1.ipcRenderer.invoke("media:resolve-playable-stream", streamUrl),
    resolveLiveStream: (streamUrl) => electron_1.ipcRenderer.invoke("media:resolve-live-stream", streamUrl),
    createStreamProxy: (streamUrl) => electron_1.ipcRenderer.invoke("media:create-stream-proxy", streamUrl),
    releaseStreamProxy: (proxyId) => electron_1.ipcRenderer.invoke("media:release-stream-proxy", proxyId),
    probeStreamInfo: (streamUrl) => electron_1.ipcRenderer.invoke("media:probe-stream-info", streamUrl),
    stopTranscoding: () => electron_1.ipcRenderer.invoke("media:stop-transcoding"),
    getAppUsageStats: () => electron_1.ipcRenderer.invoke("stats:get-app-usage"),
    getSystemStats: () => electron_1.ipcRenderer.invoke("stats:get-system"),
    getFfmpegStats: () => electron_1.ipcRenderer.invoke("stats:get-ffmpeg"),
    // Static — read once. process.platform/arch are available even in a
    // sandboxed preload; Node builtins like "os" are NOT (they crash the
    // whole preload and wipe out window.openIptv), so don't import them here.
    platformInfo: {
        arch: process.arch,
        platform: process.platform
    }
});
