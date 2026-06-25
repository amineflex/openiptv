"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
const fs_1 = require("fs");
const child_process_1 = require("child_process");
const http_1 = __importDefault(require("http"));
const https_1 = __importDefault(require("https"));
const crypto_1 = require("crypto");
const logger_1 = require("./src/services/logger");
// ── Binary resolution ─────────────────────────────────────────────────────────
// Electron GUI apps on macOS do NOT inherit the user's shell PATH (Homebrew,
// Nix, MacPorts…). We probe known installation dirs before falling back to PATH.
const EXTRA_BINARY_DIRS = (() => {
    switch (process.platform) {
        case "darwin":
            return [
                "/opt/homebrew/bin", // Homebrew – Apple Silicon (M1/M2/M3/M4)
                "/usr/local/bin", // Homebrew – Intel Macs + manual installs
                "/opt/local/bin", // MacPorts
                "/usr/bin",
            ];
        case "linux":
            return ["/usr/bin", "/usr/local/bin", "/snap/bin"];
        default:
            return []; // Windows: PATH is inherited correctly
    }
})();
function resolveBinary(name) {
    const exe = process.platform === "win32" ? `${name}.exe` : name;
    for (const dir of EXTRA_BINARY_DIRS) {
        const full = path_1.default.join(dir, exe);
        if ((0, fs_1.existsSync)(full))
            return full;
    }
    for (const dir of (process.env.PATH ?? "").split(path_1.default.delimiter)) {
        if (!dir)
            continue;
        const full = path_1.default.join(dir, exe);
        if ((0, fs_1.existsSync)(full))
            return full;
    }
    return exe; // last-resort: let the OS try
}
const FFMPEG = resolveBinary("ffmpeg");
const FFPROBE = resolveBinary("ffprobe");
const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
const logger = (0, logger_1.createLogger)("electron-main");
// Surface the resolved media binaries at startup. If either is just the bare
// name (not an absolute path), it wasn't found in any known dir or PATH — the
// usual cause of "no audio / no subtitles" on macOS (ffmpeg not installed, or
// the GUI app didn't inherit Homebrew's PATH).
logger.info("Resolved media binaries", {
    platform: process.platform,
    arch: process.arch,
    ffmpeg: FFMPEG,
    ffmpegFound: path_1.default.isAbsolute(FFMPEG),
    ffprobe: FFPROBE,
    ffprobeFound: path_1.default.isAbsolute(FFPROBE)
});
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
        icon: (() => {
            // .ico = Windows, .icns = macOS, .png = Linux
            const ext = process.platform === "win32" ? "ico" : process.platform === "darwin" ? "icns" : "png";
            const p = path_1.default.join(__dirname, `../icon.${ext}`);
            return (0, fs_1.existsSync)(p) ? p : undefined;
        })(),
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
const streamProxySources = new Map();
let transcodeServer = null;
let transcodeServerPort = null;
const mediaUsageCounters = new Map();
let lastNetworkSampleAt = Date.now();
let lastNetworkBytes = 0;
const childCpuSamples = new Map();
const activeTranscodes = new Set();
let childProcessUsageRequest = null;
let childProcessUsageCache = {
    pidsKey: "",
    updatedAt: 0,
    usages: []
};
const HOP_BY_HOP_HEADERS = new Set([
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade"
]);
function getOrCreateMediaCounter(id) {
    let counter = mediaUsageCounters.get(id);
    if (!counter) {
        counter = {
            bytesTransferred: 0,
            activeRequests: 0,
            updatedAt: Date.now()
        };
        mediaUsageCounters.set(id, counter);
        resetNetworkSampling();
    }
    return counter;
}
function totalMediaBytes() {
    let total = 0;
    for (const counter of mediaUsageCounters.values()) {
        total += counter.bytesTransferred;
    }
    return total;
}
function resetNetworkSampling() {
    lastNetworkSampleAt = Date.now();
    lastNetworkBytes = totalMediaBytes();
}
function startMediaRequest(id) {
    const counter = getOrCreateMediaCounter(id);
    counter.activeRequests += 1;
    counter.updatedAt = Date.now();
}
function finishMediaRequest(id) {
    const counter = mediaUsageCounters.get(id);
    if (!counter)
        return;
    counter.activeRequests = Math.max(0, counter.activeRequests - 1);
    counter.updatedAt = Date.now();
}
function recordMediaBytes(id, byteCount) {
    const counter = mediaUsageCounters.get(id);
    if (!counter)
        return;
    counter.bytesTransferred += byteCount;
    counter.updatedAt = Date.now();
}
function deleteMediaCounter(id) {
    mediaUsageCounters.delete(id);
    resetNetworkSampling();
}
function sampleNetworkUsage() {
    const now = Date.now();
    const totalBytes = totalMediaBytes();
    const elapsedSeconds = Math.max(0.001, (now - lastNetworkSampleAt) / 1000);
    const byteDelta = Math.max(0, totalBytes - lastNetworkBytes);
    lastNetworkSampleAt = now;
    lastNetworkBytes = totalBytes;
    let activeStreams = 0;
    for (const counter of mediaUsageCounters.values()) {
        if (counter.activeRequests > 0)
            activeStreams += 1;
    }
    return {
        networkKbps: Math.round((byteDelta * 8) / 1000 / elapsedSeconds),
        networkMB: Math.round((totalBytes / 1024 / 1024) * 10) / 10,
        activeStreams
    };
}
function runCommand(command, args, timeoutMs = 1500) {
    return new Promise((resolve, reject) => {
        const proc = (0, child_process_1.spawn)(command, args, { windowsHide: true });
        let stdout = "";
        let stderr = "";
        const timer = setTimeout(() => {
            proc.kill();
            reject(new Error(`${command} timed out`));
        }, timeoutMs);
        proc.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
        proc.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
        proc.on("error", (error) => {
            clearTimeout(timer);
            reject(error);
        });
        proc.on("close", (code) => {
            clearTimeout(timer);
            if (code === 0) {
                resolve(stdout.trim());
                return;
            }
            reject(new Error(stderr.trim() || `${command} exited with code ${code ?? "unknown"}`));
        });
    });
}
function normalizeWindowsProcessUsage(value) {
    const rows = Array.isArray(value) ? value : value ? [value] : [];
    const sampledAt = Date.now();
    const seenPids = new Set();
    const usages = rows
        .map((row) => {
        if (!row || typeof row !== "object")
            return null;
        const data = row;
        const pid = Number(data.pid);
        const cpuSeconds = Number(data.cpuSeconds);
        const ramMB = Number(data.ramMB);
        if (!Number.isInteger(pid))
            return null;
        const previous = childCpuSamples.get(pid);
        const elapsedSeconds = previous ? Math.max(0.001, (sampledAt - previous.sampledAt) / 1000) : 0;
        const cpuPercent = previous && Number.isFinite(cpuSeconds)
            ? Math.max(0, ((cpuSeconds - previous.cpuSeconds) / elapsedSeconds) * 100)
            : 0;
        childCpuSamples.set(pid, {
            cpuSeconds: Number.isFinite(cpuSeconds) ? cpuSeconds : previous?.cpuSeconds ?? 0,
            sampledAt
        });
        seenPids.add(pid);
        return {
            pid,
            type: typeof data.type === "string" ? data.type : "ffmpeg",
            cpuPercent: Math.round(cpuPercent * 10) / 10,
            ramMB: Number.isFinite(ramMB) ? Math.round(ramMB) : 0
        };
    })
        .filter((row) => Boolean(row));
    for (const pid of childCpuSamples.keys()) {
        if (!seenPids.has(pid) && !getActiveTranscodePids().includes(pid)) {
            childCpuSamples.delete(pid);
        }
    }
    return usages;
}
async function queryWindowsProcessUsage(pids) {
    const pidList = pids.join(",");
    const command = [
        `$ids=@(${pidList})`,
        "$items=@(Get-Process -Id $ids -ErrorAction SilentlyContinue | ForEach-Object { $cpu=0; if ($null -ne $_.CPU) { $cpu=[double]$_.CPU }; [pscustomobject]@{ pid=[int]$_.Id; type=$_.ProcessName; cpuSeconds=$cpu; ramMB=[math]::Round([double]$_.WorkingSet64 / 1MB) } })",
        "if ($items.Count -eq 0) { '[]' } else { $items | ConvertTo-Json -Compress }"
    ].join("; ");
    const output = await runCommand("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command]);
    return normalizeWindowsProcessUsage(JSON.parse(output || "[]"));
}
async function queryUnixProcessUsage(pids) {
    const output = await runCommand("ps", ["-o", "pid=,pcpu=,rss=", "-p", pids.join(",")]);
    return output
        .split(/\r?\n/)
        .map((line) => {
        const [pidRaw, cpuRaw, rssRaw] = line.trim().split(/\s+/);
        const pid = Number(pidRaw);
        if (!Number.isInteger(pid))
            return null;
        return {
            pid,
            type: "ffmpeg",
            cpuPercent: Math.round((Number(cpuRaw) || 0) * 10) / 10,
            ramMB: Math.round((Number(rssRaw) || 0) / 1024)
        };
    })
        .filter((row) => Boolean(row));
}
async function queryChildProcessUsage(pids) {
    try {
        return process.platform === "win32"
            ? await queryWindowsProcessUsage(pids)
            : await queryUnixProcessUsage(pids);
    }
    catch (error) {
        logger.warn("Failed to query child process usage", {
            error: error instanceof Error ? error.message : String(error),
            pids
        });
        return [];
    }
}
function getActiveTranscodePids() {
    return [...activeTranscodes]
        .map((proc) => proc.pid)
        .filter((pid) => typeof pid === "number" && Number.isInteger(pid));
}
async function getChildProcessUsages() {
    const pids = getActiveTranscodePids().sort((a, b) => a - b);
    const pidsKey = pids.join(",");
    if (!pidsKey) {
        childProcessUsageCache = { pidsKey: "", updatedAt: Date.now(), usages: [] };
        childCpuSamples.clear();
        return [];
    }
    const now = Date.now();
    if (childProcessUsageCache.pidsKey === pidsKey
        && now - childProcessUsageCache.updatedAt < 750) {
        return childProcessUsageCache.usages;
    }
    if (!childProcessUsageRequest) {
        childProcessUsageRequest = queryChildProcessUsage(pids)
            .then((usages) => {
            childProcessUsageCache = { pidsKey, updatedAt: Date.now(), usages };
            return usages;
        })
            .finally(() => {
            childProcessUsageRequest = null;
        });
    }
    return childProcessUsageRequest;
}
function createForwardHeaders(headers, remoteUrl) {
    const forwarded = {};
    for (const [name, value] of Object.entries(headers)) {
        const lowerName = name.toLowerCase();
        if (HOP_BY_HOP_HEADERS.has(lowerName) || lowerName === "host")
            continue;
        if (value === undefined)
            continue;
        forwarded[name] = value;
    }
    forwarded.host = remoteUrl.host;
    return forwarded;
}
function createResponseHeaders(headers) {
    const responseHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Expose-Headers": "Accept-Ranges, Content-Length, Content-Range, Content-Type",
        "Cache-Control": "no-store"
    };
    for (const [name, value] of Object.entries(headers)) {
        const lowerName = name.toLowerCase();
        if (HOP_BY_HOP_HEADERS.has(lowerName) || value === undefined)
            continue;
        responseHeaders[name] = Array.isArray(value) ? value : String(value);
    }
    return responseHeaders;
}
function handleStreamProxyRequest(request, response, requestUrl) {
    if (request.method === "OPTIONS") {
        response.writeHead(204, {
            "Access-Control-Allow-Headers": "Range, Content-Type, User-Agent",
            "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Max-Age": "86400"
        });
        response.end();
        return;
    }
    const match = requestUrl.pathname.match(/^\/stream\/([^/]+)$/);
    if (!match) {
        response.writeHead(404);
        response.end();
        return;
    }
    const sourceUrl = streamProxySources.get(match[1]);
    if (!sourceUrl) {
        logger.warn("Stream proxy source was not found", {
            sourceId: match[1]
        });
        response.writeHead(404);
        response.end();
        return;
    }
    let finished = false;
    let proxyRequest = null;
    const finish = () => {
        if (finished)
            return;
        finished = true;
        finishMediaRequest(match[1]);
    };
    startMediaRequest(match[1]);
    const openRemoteStream = (remoteSourceUrl, redirectCount = 0) => {
        if (finished)
            return;
        const remoteUrl = new URL(remoteSourceUrl);
        const transport = remoteUrl.protocol === "https:" ? https_1.default : http_1.default;
        proxyRequest = transport.request(remoteUrl, {
            method: request.method === "HEAD" ? "HEAD" : "GET",
            headers: createForwardHeaders(request.headers, remoteUrl)
        }, (proxyResponse) => {
            const statusCode = proxyResponse.statusCode ?? 200;
            const redirectLocation = proxyResponse.headers.location;
            if (finished) {
                proxyResponse.resume();
                return;
            }
            if (redirectLocation
                && [301, 302, 303, 307, 308].includes(statusCode)
                && redirectCount < 5) {
                proxyResponse.resume();
                openRemoteStream(new URL(redirectLocation, remoteUrl).toString(), redirectCount + 1);
                return;
            }
            response.writeHead(statusCode, proxyResponse.statusMessage, createResponseHeaders(proxyResponse.headers));
            proxyResponse.on("data", (chunk) => {
                recordMediaBytes(match[1], chunk.length);
            });
            proxyResponse.on("end", finish);
            proxyResponse.on("error", finish);
            proxyResponse.pipe(response);
        });
        proxyRequest.on("error", (error) => {
            logger.warn("Stream proxy request failed", {
                error: error.message,
                sourceUrl: remoteSourceUrl
            });
            finish();
            if (!response.headersSent)
                response.writeHead(502);
            response.end();
        });
        proxyRequest.end();
    };
    request.on("aborted", () => {
        proxyRequest?.destroy();
        finish();
    });
    response.on("close", () => {
        proxyRequest?.destroy();
        finish();
    });
    openRemoteStream(sourceUrl);
}
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
function parseFrameRate(value) {
    if (!value || value === "0/0")
        return undefined;
    const [rawNum, rawDen] = value.split("/");
    const numerator = Number(rawNum);
    const denominator = Number(rawDen ?? 1);
    if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || numerator <= 0 || denominator <= 0) {
        return undefined;
    }
    const fps = numerator / denominator;
    if (fps < 1 || fps > 120)
        return undefined;
    return `${Math.round(numerator)}/${Math.round(denominator)}`;
}
function formatVttTime(value) {
    const totalMilliseconds = Math.max(0, Math.round(value * 1000));
    const hours = Math.floor(totalMilliseconds / 3600000);
    const minutes = Math.floor((totalMilliseconds % 3600000) / 60000);
    const seconds = Math.floor((totalMilliseconds % 60000) / 1000);
    const milliseconds = totalMilliseconds % 1000;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(milliseconds).padStart(3, "0")}`;
}
function decodeFfprobePacketData(data) {
    if (!data)
        return "";
    const bytes = [];
    for (const line of data.split(/\r?\n/)) {
        const match = line.match(/^\s*[0-9a-fA-F]{8}:\s+(.+?)(?:\s{2,}|$)/);
        if (!match)
            continue;
        const hex = match[1].replace(/\s+/g, "");
        for (let index = 0; index + 1 < hex.length; index += 2) {
            const byte = Number.parseInt(hex.slice(index, index + 2), 16);
            if (Number.isFinite(byte))
                bytes.push(byte);
        }
    }
    return Buffer.from(bytes).toString("utf8").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
}
function packetsToVtt(packets) {
    const decodedPackets = packets
        .map((packet) => {
        const start = Number(packet.pts_time);
        const duration = Number(packet.duration_time);
        const text = decodeFfprobePacketData(packet.data);
        if (!Number.isFinite(start) || !text)
            return null;
        return {
            start,
            duration: Number.isFinite(duration) && duration > 0 ? duration : null,
            text
        };
    })
        .filter((packet) => Boolean(packet))
        .sort((a, b) => a.start - b.start);
    const cues = decodedPackets.flatMap((packet, index) => {
        const nextStart = decodedPackets[index + 1]?.start;
        const fallbackDuration = Number.isFinite(nextStart) && nextStart > packet.start
            ? Math.min(7, Math.max(1, nextStart - packet.start - 0.001))
            : 4;
        const duration = packet.duration ?? fallbackDuration;
        return [
            `${index + 1}`,
            `${formatVttTime(packet.start)} --> ${formatVttTime(packet.start + duration)} line:84%`,
            packet.text,
            ""
        ];
    });
    return `WEBVTT\n\n${cues.join("\n")}`.trimEnd() + "\n";
}
function probeAudioStreams(url) {
    return new Promise((resolve, reject) => {
        const proc = (0, child_process_1.spawn)(FFPROBE, [
            "-v", "quiet",
            "-print_format", "json",
            "-show_streams",
            "-show_format",
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
                const streams = parsed.streams ?? [];
                const videoStream = streams.find((stream) => stream.codec_type === "video");
                resolve({
                    streams: streams.filter((stream) => stream.codec_type === "audio"),
                    durationSeconds: parseDurationSeconds(parsed.format?.duration),
                    videoFps: parseFrameRate(videoStream?.avg_frame_rate) ?? parseFrameRate(videoStream?.r_frame_rate)
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
            if (requestUrl.pathname.startsWith("/stream/")) {
                handleStreamProxyRequest(request, response, requestUrl);
                return;
            }
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
            const transcodeSource = transcodeSources.get(match[1]);
            if (!transcodeSource) {
                logger.warn("Transcode source was not found", {
                    sourceId: match[1]
                });
                response.writeHead(404);
                response.end();
                return;
            }
            const sourceUrl = transcodeSource.url;
            const videoFps = transcodeSource.videoFps ?? "24000/1001";
            // Only one video plays at a time: terminate any prior transcode (the
            // previous movie, or the pre-seek / pre-audio-switch position) so ffmpeg
            // processes can never accumulate.
            killAllTranscodes();
            response.writeHead(200, {
                "Access-Control-Allow-Origin": "*",
                "Cache-Control": "no-store",
                "Content-Type": "video/mp2t"
            });
            startMediaRequest(match[1]);
            let mediaRequestFinished = false;
            const finishTranscodeMediaRequest = () => {
                if (mediaRequestFinished)
                    return;
                mediaRequestFinished = true;
                finishMediaRequest(match[1]);
            };
            const args = [
                "-hide_banner",
                "-loglevel", "error",
                "-fflags", "+genpts",
                ...(startTime > 0 ? ["-ss", startTime.toFixed(3)] : []),
                "-i", sourceUrl,
                "-map", "0:v:0?",
                "-map", `0:a:${audioIndex}?`,
                "-vf", `settb=AVTB,setpts=N/((${videoFps})*TB)`,
                "-c:v", "libx264",
                "-preset", "veryfast",
                "-crf", "23",
                "-pix_fmt", "yuv420p",
                "-af", "aresample=async=1:first_pts=0,asetpts=N/SR/TB",
                "-c:a", "aac",
                "-ac", "2",
                "-b:a", "192k",
                "-muxdelay", "0",
                "-muxpreload", "0",
                "-mpegts_flags", "+resend_headers",
                "-f", "mpegts",
                "pipe:1"
            ];
            const proc = (0, child_process_1.spawn)(FFMPEG, args);
            activeTranscodes.add(proc);
            // Drain stderr: if nobody reads it, a full OS pipe buffer makes ffmpeg
            // block mid-write and freeze, which then ignores the dead stdout pipe.
            proc.stderr.on("data", () => { });
            proc.stdout.on("data", (chunk) => {
                recordMediaBytes(match[1], chunk.length);
            });
            proc.stdout.pipe(response);
            proc.on("error", (error) => {
                logger.exception("Failed to run ffmpeg transcode process", error, {
                    sourceUrl,
                    startTime
                });
                finishTranscodeMediaRequest();
                killTranscode(proc);
            });
            proc.on("close", () => {
                activeTranscodes.delete(proc);
                finishTranscodeMediaRequest();
            });
            // The <video> went away — switched movie, sought, or the player
            // unmounted. Chromium tears down the streaming response, so listen on
            // both ends (response close is the reliable one here) and kill ffmpeg.
            response.on("close", () => { finishTranscodeMediaRequest(); killTranscode(proc); });
            request.on("aborted", () => { finishTranscodeMediaRequest(); killTranscode(proc); });
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
async function createTranscodedAudioUrl(sourceUrl, videoFps) {
    const port = await ensureTranscodeServer();
    const id = (0, crypto_1.randomUUID)();
    transcodeSources.set(id, { url: sourceUrl, videoFps });
    getOrCreateMediaCounter(id);
    logger.debug("Created local transcode source", {
        sourceId: id,
        sourceUrl,
        videoFps
    });
    return `http://127.0.0.1:${port}/transcode/${id}`;
}
async function createStreamProxyUrl(sourceUrl) {
    const port = await ensureTranscodeServer();
    const id = (0, crypto_1.randomUUID)();
    streamProxySources.set(id, sourceUrl);
    getOrCreateMediaCounter(id);
    logger.debug("Created local stream proxy source", {
        sourceId: id,
        sourceUrl
    });
    return {
        id,
        url: `http://127.0.0.1:${port}/stream/${id}`
    };
}
electron_1.ipcMain.handle("media:create-stream-proxy", async (_event, rawUrl) => {
    let url;
    try {
        url = assertHttpUrl(rawUrl);
    }
    catch (error) {
        logger.warn("Rejected stream proxy request", {
            error: error instanceof Error ? error.message : "Invalid URL"
        });
        return {
            ok: false,
            url: "",
            error: error instanceof Error ? error.message : "Invalid URL"
        };
    }
    try {
        const proxy = await createStreamProxyUrl(url);
        return {
            ok: true,
            id: proxy.id,
            url: proxy.url
        };
    }
    catch (error) {
        logger.exception("Failed to create stream proxy", error, {
            url
        });
        return {
            ok: false,
            url,
            error: error instanceof Error ? error.message : "Failed to create stream proxy"
        };
    }
});
electron_1.ipcMain.handle("media:release-stream-proxy", (_event, rawId) => {
    if (typeof rawId !== "string")
        return { ok: false };
    streamProxySources.delete(rawId);
    deleteMediaCounter(rawId);
    return { ok: true };
});
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
        const proc = (0, child_process_1.spawn)(FFPROBE, [
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
                    .map((stream, relativeIndex) => ({ stream, relativeIndex }))
                    .filter(({ stream }) => TEXT_SUBTITLE_CODECS.has((stream.codec_name ?? "").toLowerCase()))
                    .map(({ stream, relativeIndex }) => {
                    const language = (stream.tags?.language ?? "und").slice(0, 3);
                    const label = stream.tags?.title?.trim()
                        || (language !== "und" ? language.toUpperCase() : `Track ${stream.index}`);
                    return {
                        id: `embedded:${stream.index}`,
                        index: stream.index,
                        relativeIndex,
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
electron_1.ipcMain.handle("subtitle:extract-embedded-window", async (_event, rawUrl, index, relativeIndex, startSeconds, durationSeconds) => {
    let url;
    try {
        url = assertHttpUrl(rawUrl);
    }
    catch (error) {
        logger.warn("Rejected embedded subtitle window request", {
            error: error instanceof Error ? error.message : "Invalid URL"
        });
        return { ok: false, error: error instanceof Error ? error.message : "Invalid URL" };
    }
    const fallbackStreamIndex = Number(index);
    const subtitleRelativeIndex = Number(relativeIndex);
    const streamSpecifier = Number.isInteger(subtitleRelativeIndex) && subtitleRelativeIndex >= 0
        ? `s:${subtitleRelativeIndex}`
        : String(fallbackStreamIndex);
    if (!Number.isInteger(subtitleRelativeIndex) && (!Number.isInteger(fallbackStreamIndex) || fallbackStreamIndex < 0)) {
        return { ok: false, error: "Invalid stream index" };
    }
    const windowStart = Math.max(0, Number(startSeconds) || 0);
    const windowDuration = Math.max(15, Math.min(300, Number(durationSeconds) || 90));
    return new Promise((resolve) => {
        const proc = (0, child_process_1.spawn)(FFPROBE, [
            "-v", "error",
            "-read_intervals", `${windowStart}%+${windowDuration}`,
            "-select_streams", streamSpecifier,
            "-show_packets",
            "-show_data",
            "-show_entries", "packet=pts_time,duration_time,data",
            "-of", "json",
            url
        ]);
        let stdout = "";
        let stderr = "";
        proc.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
        proc.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
        const killTimer = setTimeout(() => {
            if (!proc.killed)
                proc.kill();
        }, 20000);
        proc.on("close", () => {
            clearTimeout(killTimer);
            try {
                const parsed = JSON.parse(stdout || "{}");
                resolve({
                    ok: true,
                    vtt: packetsToVtt(parsed.packets ?? []),
                    windowStart,
                    windowDuration
                });
            }
            catch (error) {
                logger.exception("Failed to parse embedded subtitle window output", error, {
                    stderr,
                    url,
                    streamSpecifier
                });
                resolve({ ok: false, error: stderr.trim() || "Failed to read subtitle window" });
            }
        });
        proc.on("error", (error) => {
            clearTimeout(killTimer);
            logger.exception("Failed to run ffprobe for embedded subtitle window", error, {
                streamSpecifier,
                url
            });
            resolve({ ok: false, error: error.message });
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
        const proc = (0, child_process_1.spawn)(FFMPEG, [
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
        const transcodeBaseUrl = await createTranscodedAudioUrl(url, probeResult.videoFps);
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
        const proc = (0, child_process_1.spawn)(FFPROBE, [
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
    for (const id of transcodeSources.keys()) {
        deleteMediaCounter(id);
    }
    transcodeSources.clear();
    return { ok: true };
});
async function getAppUsageStats() {
    // app.getAppMetrics() returns per-process stats (main, renderer, GPU…)
    // percentCPUUsage is measured since the previous call, so the polling
    // interval on the renderer side drives the measurement window.
    const metrics = electron_1.app.getAppMetrics();
    let cpuPercent = 0;
    let ramMB = 0;
    const processes = [];
    for (const m of metrics) {
        cpuPercent += m.cpu.percentCPUUsage;
        const mRamMB = Math.round(m.memory.workingSetSize / 1024);
        ramMB += mRamMB;
        processes.push({
            pid: m.pid,
            type: m.type,
            cpuPercent: Math.round(m.cpu.percentCPUUsage * 10) / 10,
            ramMB: mRamMB
        });
    }
    const childProcesses = await getChildProcessUsages();
    for (const childProcess of childProcesses) {
        cpuPercent += childProcess.cpuPercent;
        ramMB += childProcess.ramMB;
        processes.push(childProcess);
    }
    const network = sampleNetworkUsage();
    return {
        cpuPercent: Math.min(100, Math.round(cpuPercent)),
        ramMB,
        ...network,
        gpuProcess: processes.find((processUsage) => processUsage.type.toLowerCase().includes("gpu")),
        processes
    };
}
electron_1.ipcMain.handle("stats:get-app-usage", () => getAppUsageStats());
electron_1.ipcMain.handle("stats:get-system", () => getAppUsageStats());
electron_1.app.on("before-quit", () => {
    logger.info("Electron app is quitting");
    killAllTranscodes();
    streamProxySources.clear();
    transcodeSources.clear();
    mediaUsageCounters.clear();
    transcodeServer?.close();
    transcodeServer = null;
    transcodeServerPort = null;
});
