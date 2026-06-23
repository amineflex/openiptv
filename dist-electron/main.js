"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
const child_process_1 = require("child_process");
const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
// Expose the experimental AudioTrack API and proprietary audio decoding so
// multi-audio MKV streams behave (these flags must be set before app is ready).
electron_1.app.commandLine.appendSwitch("enable-experimental-web-platform-features");
electron_1.app.commandLine.appendSwitch("enable-platform-ac3-eac3-audio");
function assertHttpUrl(raw) {
    if (typeof raw !== "string")
        throw new Error("URL must be a string");
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new Error("Only http and https URLs are allowed");
    }
    return raw;
}
function createWindow() {
    const win = new electron_1.BrowserWindow({
        width: 1280,
        height: 800,
        autoHideMenuBar: true,
        webPreferences: {
            preload: path_1.default.join(__dirname, "preload.js"),
            contextIsolation: true,
            nodeIntegration: false,
            experimentalFeatures: true,
            enableBlinkFeatures: "AudioVideoTracks"
        }
    });
    if (VITE_DEV_SERVER_URL) {
        void win.loadURL(VITE_DEV_SERVER_URL);
        win.webContents.openDevTools();
    }
    else {
        void win.loadFile(path_1.default.join(__dirname, "../dist/index.html"));
    }
}
electron_1.app.whenReady().then(() => {
    createWindow();
    electron_1.app.on("activate", () => {
        if (electron_1.BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});
electron_1.app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
        electron_1.app.quit();
    }
});
// Only text-based subtitle codecs can be converted to WebVTT.
// Bitmap subtitles (hdmv_pgs_subtitle, dvd_subtitle, dvb_subtitle...) cannot.
const TEXT_SUBTITLE_CODECS = new Set([
    "subrip", "srt", "ass", "ssa", "mov_text", "webvtt", "vtt", "text", "microdvd", "micro_dvd"
]);
electron_1.ipcMain.handle("subtitle:list-embedded", async (_event, rawUrl) => {
    let url;
    try {
        url = assertHttpUrl(rawUrl);
    }
    catch (error) {
        return { ok: false, tracks: [], error: error instanceof Error ? error.message : "Invalid URL" };
    }
    return new Promise((resolve) => {
        const proc = (0, child_process_1.spawn)("ffprobe", [
            "-v", "quiet",
            "-print_format", "json",
            "-show_streams",
            "-select_streams", "s",
            url
        ]);
        let stdout = "";
        let stderr = "";
        proc.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
        proc.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
        proc.on("close", () => {
            try {
                const parsed = JSON.parse(stdout);
                const streams = parsed.streams ?? [];
                const tracks = streams
                    .filter((stream) => TEXT_SUBTITLE_CODECS.has((stream.codec_name ?? "").toLowerCase()))
                    .map((stream) => {
                    const language = (stream.tags?.language ?? "und").slice(0, 3);
                    const label = stream.tags?.title?.trim()
                        || (language !== "und" ? language.toUpperCase() : `Track ${stream.index}`);
                    return {
                        id: `embedded:${stream.index}`,
                        index: stream.index,
                        codec: stream.codec_name ?? "",
                        language,
                        label
                    };
                });
                resolve({ ok: true, tracks });
            }
            catch {
                resolve({ ok: false, tracks: [], error: stderr.trim() || "Failed to read subtitle streams" });
            }
        });
        proc.on("error", (error) => resolve({ ok: false, tracks: [], error: error.message }));
    });
});
electron_1.ipcMain.handle("subtitle:extract-embedded", async (_event, rawUrl, index) => {
    let url;
    try {
        url = assertHttpUrl(rawUrl);
    }
    catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : "Invalid URL" };
    }
    const streamIndex = Number(index);
    if (!Number.isInteger(streamIndex) || streamIndex < 0) {
        return { ok: false, error: "Invalid stream index" };
    }
    return new Promise((resolve) => {
        const proc = (0, child_process_1.spawn)("ffmpeg", [
            "-hide_banner",
            "-loglevel", "error",
            "-i", url,
            "-map", `0:${streamIndex}`,
            "-f", "webvtt",
            "pipe:1"
        ]);
        let output = "";
        let stderr = "";
        proc.stdout.on("data", (chunk) => { output += chunk.toString(); });
        proc.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
        proc.on("close", (code) => {
            if (code === 0 && output.trim().length > 0) {
                resolve({ ok: true, vtt: output });
            }
            else {
                resolve({ ok: false, error: stderr.trim() || `ffmpeg exited with code ${code ?? "unknown"}` });
            }
        });
        proc.on("error", (error) => resolve({ ok: false, error: error.message }));
    });
});
