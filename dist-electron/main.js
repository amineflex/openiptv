"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
const child_process_1 = require("child_process");
const http_1 = __importDefault(require("http"));
const crypto_1 = require("crypto");
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
const UNSUPPORTED_BROWSER_AUDIO_CODECS = new Set(["ac3", "eac3", "truehd", "dts", "dts_hd"]);
const transcodeSources = new Map();
let transcodeServer = null;
let transcodeServerPort = null;
function parseDurationSeconds(value) {
    if (!value)
        return undefined;
    const duration = Number(value);
    return Number.isFinite(duration) && duration > 0 ? duration : undefined;
}
function probeAudioStreams(url) {
    return new Promise((resolve, reject) => {
        const proc = (0, child_process_1.spawn)("ffprobe", [
            "-v", "quiet",
            "-print_format", "json",
            "-show_streams",
            "-show_format",
            "-select_streams", "a",
            url
        ]);
        let stdout = "";
        let stderr = "";
        proc.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
        proc.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
        proc.on("close", (code) => {
            if (code !== 0) {
                reject(new Error(stderr.trim() || `ffprobe exited with code ${code ?? "unknown"}`));
                return;
            }
            try {
                const parsed = JSON.parse(stdout);
                resolve({
                    streams: parsed.streams ?? [],
                    durationSeconds: parseDurationSeconds(parsed.format?.duration)
                });
            }
            catch {
                reject(new Error("Failed to read audio streams"));
            }
        });
        proc.on("error", reject);
    });
}
function shouldTranscodeAudio(streams) {
    if (streams.length === 0)
        return false;
    const defaultStream = streams.find((stream) => stream.disposition?.default === 1) ?? streams[0];
    const codec = (defaultStream.codec_name ?? "").toLowerCase();
    return UNSUPPORTED_BROWSER_AUDIO_CODECS.has(codec);
}
function ensureTranscodeServer() {
    if (transcodeServerPort)
        return Promise.resolve(transcodeServerPort);
    return new Promise((resolve, reject) => {
        const server = http_1.default.createServer((request, response) => {
            const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host ?? "127.0.0.1"}`);
            const match = requestUrl.pathname.match(/^\/transcode\/([^/]+)$/);
            if (!match) {
                response.writeHead(404);
                response.end();
                return;
            }
            const sourceUrl = transcodeSources.get(match[1]);
            if (!sourceUrl) {
                response.writeHead(404);
                response.end();
                return;
            }
            response.writeHead(200, {
                "Access-Control-Allow-Origin": "*",
                "Cache-Control": "no-store",
                "Content-Type": "video/mp4"
            });
            const proc = (0, child_process_1.spawn)("ffmpeg", [
                "-hide_banner",
                "-loglevel", "error",
                "-i", sourceUrl,
                "-map", "0:v:0?",
                "-map", "0:a:0?",
                "-c:v", "copy",
                "-c:a", "aac",
                "-ac", "2",
                "-b:a", "192k",
                "-movflags", "frag_keyframe+empty_moov+default_base_moof",
                "-f", "mp4",
                "pipe:1"
            ]);
            proc.stdout.pipe(response);
            request.on("close", () => {
                if (!proc.killed)
                    proc.kill("SIGKILL");
            });
        });
        server.on("error", reject);
        server.listen(0, "127.0.0.1", () => {
            const address = server.address();
            if (!address || typeof address === "string") {
                server.close();
                reject(new Error("Failed to start local transcoding server"));
                return;
            }
            transcodeServer = server;
            transcodeServerPort = address.port;
            resolve(address.port);
        });
    });
}
async function createTranscodedAudioUrl(sourceUrl) {
    const port = await ensureTranscodeServer();
    const id = (0, crypto_1.randomUUID)();
    transcodeSources.set(id, sourceUrl);
    return `http://127.0.0.1:${port}/transcode/${id}`;
}
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
electron_1.ipcMain.handle("media:resolve-playable-stream", async (_event, rawUrl) => {
    let url;
    try {
        url = assertHttpUrl(rawUrl);
    }
    catch (error) {
        return {
            ok: false,
            url: "",
            transcoded: false,
            audioCodecs: [],
            error: error instanceof Error ? error.message : "Invalid URL"
        };
    }
    try {
        const probeResult = await probeAudioStreams(url);
        const audioStreams = probeResult.streams;
        const audioCodecs = audioStreams.map((stream) => (stream.codec_name ?? "unknown").toLowerCase());
        if (!shouldTranscodeAudio(audioStreams)) {
            return {
                ok: true,
                url,
                transcoded: false,
                audioCodecs,
                durationSeconds: probeResult.durationSeconds
            };
        }
        return {
            ok: true,
            url: await createTranscodedAudioUrl(url),
            transcoded: true,
            audioCodecs,
            durationSeconds: probeResult.durationSeconds
        };
    }
    catch (error) {
        return {
            ok: false,
            url,
            transcoded: false,
            audioCodecs: [],
            error: error instanceof Error ? error.message : "Failed to inspect audio streams"
        };
    }
});
electron_1.app.on("before-quit", () => {
    transcodeServer?.close();
    transcodeServer = null;
    transcodeServerPort = null;
});
