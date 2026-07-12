"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld("openIptv", {
    listEmbeddedSubtitles: (streamUrl) => electron_1.ipcRenderer.invoke("subtitle:list-embedded", streamUrl),
    extractEmbeddedSubtitleWindow: (streamUrl, streamIndex, relativeIndex, startSeconds, durationSeconds) => electron_1.ipcRenderer.invoke("subtitle:extract-embedded-window", streamUrl, streamIndex, relativeIndex, startSeconds, durationSeconds),
    resolvePlayableStream: (streamUrl) => electron_1.ipcRenderer.invoke("media:resolve-playable-stream", streamUrl),
    resolveLiveStream: (streamUrl) => electron_1.ipcRenderer.invoke("media:resolve-live-stream", streamUrl),
    createStreamProxy: (streamUrl) => electron_1.ipcRenderer.invoke("media:create-stream-proxy", streamUrl),
    createHlsProxy: (streamUrl) => electron_1.ipcRenderer.invoke("media:create-hls-proxy", streamUrl),
    releaseStreamProxy: (proxyId) => electron_1.ipcRenderer.invoke("media:release-stream-proxy", proxyId),
    probeStreamInfo: (streamUrl) => electron_1.ipcRenderer.invoke("media:probe-stream-info", streamUrl),
    stopTranscoding: () => electron_1.ipcRenderer.invoke("media:stop-transcoding"),
    openExternal: (url) => electron_1.ipcRenderer.invoke("shell:open-external", url),
    getAppUsageStats: () => electron_1.ipcRenderer.invoke("stats:get-app-usage"),
    getFfmpegStats: () => electron_1.ipcRenderer.invoke("stats:get-ffmpeg"),
    // ── Auto-updater ────────────────────────────────────────────────────────────
    // Listen for update lifecycle events forwarded from the main process.
    // Callbacks are registered once at mount; the returned cleanup function
    // removes the listener (call it from useEffect's return value).
    onUpdateAvailable: (cb) => {
        const handler = () => cb();
        electron_1.ipcRenderer.on("updater:available", handler);
        return () => electron_1.ipcRenderer.removeListener("updater:available", handler);
    },
    onUpdateDownloaded: (cb) => {
        const handler = (_e, info) => cb(info);
        electron_1.ipcRenderer.on("updater:downloaded", handler);
        return () => electron_1.ipcRenderer.removeListener("updater:downloaded", handler);
    },
    installUpdate: () => electron_1.ipcRenderer.invoke("updater:quit-and-install"),
    // ── Downloads (offline, Netflix-style) ───────────────────────────────────────
    // Media is fetched by the main process into <userData>/Downloads. The renderer
    // drives it through these invokes and subscribes to progress/changed/removed
    // events; every listener returns a cleanup function (call from useEffect).
    downloads: {
        list: () => electron_1.ipcRenderer.invoke("downloads:list"),
        start: (input) => electron_1.ipcRenderer.invoke("downloads:start", input),
        cancel: (id) => electron_1.ipcRenderer.invoke("downloads:cancel", id),
        remove: (id) => electron_1.ipcRenderer.invoke("downloads:delete", id),
        openFile: (id) => electron_1.ipcRenderer.invoke("downloads:open-file", id),
        playback: (id) => electron_1.ipcRenderer.invoke("downloads:playback", id),
        reveal: (id) => electron_1.ipcRenderer.invoke("downloads:reveal", id),
        openFolder: () => electron_1.ipcRenderer.invoke("downloads:open-folder"),
        onProgress: (cb) => {
            const handler = (_e, progress) => cb(progress);
            electron_1.ipcRenderer.on("downloads:progress", handler);
            return () => electron_1.ipcRenderer.removeListener("downloads:progress", handler);
        },
        onChanged: (cb) => {
            const handler = (_e, record) => cb(record);
            electron_1.ipcRenderer.on("downloads:changed", handler);
            return () => electron_1.ipcRenderer.removeListener("downloads:changed", handler);
        },
        onRemoved: (cb) => {
            const handler = (_e, payload) => cb(payload);
            electron_1.ipcRenderer.on("downloads:removed", handler);
            return () => electron_1.ipcRenderer.removeListener("downloads:removed", handler);
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
