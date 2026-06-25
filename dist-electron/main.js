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
const logger_1 = require("./src/services/logger");
const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
const logger = (0, logger_1.createLogger)("electron-main");
process.on("uncaughtException", (error) => {
    logger.exception("Uncaught exception", error);
});
process.on("unhandledRejection", (reason) => {
    logger.exception("Unhandled promise rejection", reason);
});
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
    logger.info("Creating browser window", {
        devMode: Boolean(VITE_DEV_SERVER_URL)
    });
    const win = new electron_1.BrowserWindow({
        width: 1280,
        height: 800,
        autoHideMenuBar: true,
        icon: path_1.default.join(__dirname, "../icon.ico"),
        webPreferences: {
            preload: path_1.default.join(__dirname, "preload.js"),
            contextIsolation: true,
            nodeIntegration: false,
            experimentalFeatures: true,
            enableBlinkFeatures: "AudioVideoTracks"
        }
    });
    if (VITE_DEV_SERVER_URL) {
        void win.loadURL(VITE_DEV_SERVER_URL).catch((error) => {
            logger.exception("Failed to load dev server URL", error, {
                url: VITE_DEV_SERVER_URL
            });
        });
        win.webContents.openDevTools();
    }
    else {
        void win.loadFile(path_1.default.join(__dirname, "../dist/index.html")).catch((error) => {
            logger.exception("Failed to load bundled app", error);
        });
    }
}
electron_1.app.whenReady()
    .then(() => {
    logger.info("Electron app is ready");
    createWindow();
    electron_1.app.on("activate", () => {
        if (electron_1.BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
})
    .catch((error) => {
    logger.exception("Failed to initialize Electron app", error);
    electron_1.app.quit();
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
const activeTranscodes = new Set();
function killTranscode(proc) {
    activeTranscodes.delete(proc);
    // Already exited — nothing to do.
    if (proc.exitCode !== null || proc.signalCode !== null)
        return;
    try {
        proc.stdout?.unpipe();
        proc.stdout?.destroy();
        proc.kill(); // SIGTERM (immediate TerminateProcess on Windows)
    }
    catch (error) {
        logger.warn("Failed to terminate transcode process", {
            error: error instanceof Error ? error.message : String(error)
        });
        return;
    }
    // Fallback: force-kill if it ignored the first signal (POSIX only; on Windows
    // the first kill already terminates the process).
    const forceTimer = setTimeout(() => {
        if (proc.exitCode === null && proc.signalCode === null) {
            try {
                proc.kill("SIGKILL");
            }
            catch {
                /* process is already gone */
            }
        }
    }, 1500);
    forceTimer.unref();
}
function killAllTranscodes() {
    for (const proc of [...activeTranscodes]) {
        killTranscode(proc);
    }
}
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
            catch (error) {
                logger.exception("Failed to parse audio probe output", error, {
                    stderr,
                    url
                });
                reject(new Error("Failed to read audio streams"));
            }
        });
        proc.on("error", (error) => {
            logger.exception("Failed to run ffprobe for audio streams", error, {
                url
            });
            reject(error);
        });
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
            const startTime = Math.max(0, Number(requestUrl.searchParams.get("start") ?? 0) || 0);
            const audioIndex = Math.max(0, Math.trunc(Number(requestUrl.searchParams.get("audio") ?? 0)) || 0);
            if (!match) {
                logger.warn("Transcode request did not match a known route", {
                    pathname: requestUrl.pathname
                });
                response.writeHead(404);
                response.end();
                return;
            }
            const sourceUrl = transcodeSources.get(match[1]);
            if (!sourceUrl) {
                logger.warn("Transcode source was not found", {
                    sourceId: match[1]
                });
                response.writeHead(404);
                response.end();
                return;
            }
            // Only one video plays at a time: terminate any prior transcode (the
            // previous movie, or the pre-seek / pre-audio-switch position) so ffmpeg
            // processes can never accumulate.
            killAllTranscodes();
            response.writeHead(200, {
                "Access-Control-Allow-Origin": "*",
                "Cache-Control": "no-store",
                "Content-Type": "video/mp4"
            });
            const args = [
                "-hide_banner",
                "-loglevel", "error",
                "-fflags", "+genpts",
                ...(startTime > 0 ? ["-ss", startTime.toFixed(3)] : []),
                "-i", sourceUrl,
                "-map", "0:v:0?",
                "-map", `0:a:${audioIndex}?`,
                "-vf", "setpts=PTS-STARTPTS",
                "-c:v", "libx264",
                "-preset", "veryfast",
                "-crf", "23",
                "-pix_fmt", "yuv420p",
                "-af", "aresample=async=1:first_pts=0",
                "-c:a", "aac",
                "-ac", "2",
                "-b:a", "192k",
                "-avoid_negative_ts", "make_zero",
                "-muxdelay", "0",
                "-muxpreload", "0",
                "-movflags", "frag_keyframe+empty_moov+default_base_moof",
                "-f", "mp4",
                "pipe:1"
            ];
            const proc = (0, child_process_1.spawn)("ffmpeg", args);
            activeTranscodes.add(proc);
            // Drain stderr: if nobody reads it, a full OS pipe buffer makes ffmpeg
            // block mid-write and freeze, which then ignores the dead stdout pipe.
            proc.stderr.on("data", () => { });
            proc.stdout.pipe(response);
            proc.on("error", (error) => {
                logger.exception("Failed to run ffmpeg transcode process", error, {
                    sourceUrl,
                    startTime
                });
                killTranscode(proc);
            });
            proc.on("close", () => {
                activeTranscodes.delete(proc);
            });
            // The <video> went away — switched movie, sought, or the player
            // unmounted. Chromium tears down the streaming response, so listen on
            // both ends (response close is the reliable one here) and kill ffmpeg.
            response.on("close", () => killTranscode(proc));
            request.on("close", () => killTranscode(proc));
            request.on("aborted", () => killTranscode(proc));
        });
        server.on("error", (error) => {
            logger.exception("Local transcode server error", error);
            reject(error);
        });
        server.listen(0, "127.0.0.1", () => {
            const address = server.address();
            if (!address || typeof address === "string") {
                server.close();
                reject(new Error("Failed to start local transcoding server"));
                return;
            }
            transcodeServer = server;
            transcodeServerPort = address.port;
            logger.info("Local transcode server started", {
                port: address.port
            });
            resolve(address.port);
        });
    });
}
async function createTranscodedAudioUrl(sourceUrl) {
    const port = await ensureTranscodeServer();
    const id = (0, crypto_1.randomUUID)();
    transcodeSources.set(id, sourceUrl);
    logger.debug("Created local transcode source", {
        sourceId: id,
        sourceUrl
    });
    return `http://127.0.0.1:${port}/transcode/${id}`;
}
electron_1.ipcMain.handle("subtitle:list-embedded", async (_event, rawUrl) => {
    let url;
    try {
        url = assertHttpUrl(rawUrl);
    }
    catch (error) {
        logger.warn("Rejected embedded subtitle list request", {
            error: error instanceof Error ? error.message : "Invalid URL"
        });
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
            catch (error) {
                logger.exception("Failed to parse embedded subtitle probe output", error, {
                    stderr,
                    url
                });
                resolve({ ok: false, tracks: [], error: stderr.trim() || "Failed to read subtitle streams" });
            }
        });
        proc.on("error", (error) => {
            logger.exception("Failed to run ffprobe for embedded subtitles", error, {
                url
            });
            resolve({ ok: false, tracks: [], error: error.message });
        });
    });
});
electron_1.ipcMain.handle("subtitle:extract-embedded", async (_event, rawUrl, index) => {
    let url;
    try {
        url = assertHttpUrl(rawUrl);
    }
    catch (error) {
        logger.warn("Rejected embedded subtitle extraction request", {
            error: error instanceof Error ? error.message : "Invalid URL"
        });
        return { ok: false, error: error instanceof Error ? error.message : "Invalid URL" };
    }
    const streamIndex = Number(index);
    if (!Number.isInteger(streamIndex) || streamIndex < 0) {
        logger.warn("Rejected embedded subtitle extraction index", {
            index
        });
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
                logger.warn("Embedded subtitle extraction process failed", {
                    code,
                    stderr,
                    streamIndex,
                    url
                });
                resolve({ ok: false, error: stderr.trim() || `ffmpeg exited with code ${code ?? "unknown"}` });
            }
        });
        proc.on("error", (error) => {
            logger.exception("Failed to run ffmpeg for embedded subtitle extraction", error, {
                streamIndex,
                url
            });
            resolve({ ok: false, error: error.message });
        });
    });
});
electron_1.ipcMain.handle("media:resolve-playable-stream", async (_event, rawUrl) => {
    let url;
    try {
        url = assertHttpUrl(rawUrl);
    }
    catch (error) {
        logger.warn("Rejected playable stream resolve request", {
            error: error instanceof Error ? error.message : "Invalid URL"
        });
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
        const audioTracks = audioStreams.map((stream) => ({
            index: stream.index,
            codec: stream.codec_name ?? "unknown",
            language: stream.tags?.language,
            title: stream.tags?.title,
            isDefault: stream.disposition?.default === 1
        }));
        const defaultIdx = audioStreams.findIndex((s) => s.disposition?.default === 1);
        const defaultAudioIndex = defaultIdx >= 0 ? defaultIdx : 0;
        if (!shouldTranscodeAudio(audioStreams)) {
            return {
                ok: true,
                url,
                transcoded: false,
                audioCodecs,
                audioTracks,
                defaultAudioIndex,
                durationSeconds: probeResult.durationSeconds
            };
        }
        const transcodeBaseUrl = await createTranscodedAudioUrl(url);
        return {
            ok: true,
            url: transcodeBaseUrl,
            transcoded: true,
            audioCodecs,
            audioTracks,
            transcodeBaseUrl,
            defaultAudioIndex,
            durationSeconds: probeResult.durationSeconds
        };
    }
    catch (error) {
        logger.exception("Failed to resolve playable stream", error, {
            url
        });
        return {
            ok: false,
            url,
            transcoded: false,
            audioCodecs: [],
            error: error instanceof Error ? error.message : "Failed to inspect audio streams"
        };
    }
});
electron_1.ipcMain.handle("media:probe-stream-info", (_event, rawUrl) => {
    let url;
    try {
        url = assertHttpUrl(rawUrl);
    }
    catch (error) {
        return Promise.resolve({ ok: false, error: error instanceof Error ? error.message : "Invalid URL" });
    }
    return new Promise((resolve) => {
        const proc = (0, child_process_1.spawn)("ffprobe", [
            "-v", "quiet",
            "-print_format", "json",
            "-show_streams",
            "-show_format",
            "-analyzeduration", "2000000",
            "-probesize", "1000000",
            url
        ]);
        let stdout = "";
        let stderr = "";
        proc.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
        proc.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
        const killTimer = setTimeout(() => { if (!proc.killed)
            proc.kill(); }, 10000);
        proc.on("close", (code) => {
            clearTimeout(killTimer);
            if (code === 0 && stdout.trim()) {
                try {
                    const parsed = JSON.parse(stdout);
                    resolve({ ok: true, streams: parsed.streams ?? [], format: parsed.format });
                }
                catch {
                    resolve({ ok: false, error: "Failed to parse probe output" });
                }
            }
            else {
                resolve({ ok: false, error: stderr.trim() || `ffprobe exited with code ${code ?? "unknown"}` });
            }
        });
        proc.on("error", (error) => {
            clearTimeout(killTimer);
            logger.exception("Failed to run ffprobe for stream info", error, { url });
            resolve({ ok: false, error: error.message });
        });
    });
});
// Lets the renderer proactively stop transcoding when the player unmounts (e.g.
// the user backs out to the menu without starting another movie), instead of
// relying solely on the streaming connection tearing down.
electron_1.ipcMain.handle("media:stop-transcoding", () => {
    killAllTranscodes();
    return { ok: true };
});
electron_1.app.on("before-quit", () => {
    logger.info("Electron app is quitting");
    killAllTranscodes();
    transcodeServer?.close();
    transcodeServer = null;
    transcodeServerPort = null;
});
