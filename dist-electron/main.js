"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// ── Squirrel.Windows lifecycle ────────────────────────────────────────────────
// Must be the very first executable code — Squirrel relaunches the exe with
// --squirrel-* flags during install/update/uninstall. If we don't exit here,
// a ghost window briefly appears during installation.
const electron_squirrel_startup_1 = __importDefault(require("electron-squirrel-startup"));
if (electron_squirrel_startup_1.default) {
    process.exit(0);
}
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
const fs_1 = require("fs");
const promises_1 = require("fs/promises");
const child_process_1 = require("child_process");
const http_1 = __importDefault(require("http"));
const https_1 = __importDefault(require("https"));
const crypto_1 = require("crypto");
const logger_1 = require("./src/services/logger");
// ── Binary resolution ─────────────────────────────────────────────────────────
// Electron GUI apps launched from Finder/Dock on macOS (and some Linux DEs) get
// a stripped PATH that never sourced the user's shell profile — so Homebrew,
// MacPorts, Nix, asdf… are invisible. We resolve media binaries from three
// sources: well-known install dirs, the login shell's real PATH, and our own
// inherited PATH. The merged PATH is also pushed back onto process.env.PATH so
// every spawned ffmpeg/ffprobe child inherits it too.
const WELL_KNOWN_BINARY_DIRS = (() => {
    switch (process.platform) {
        case "darwin":
            return [
                "/opt/homebrew/bin", // Homebrew – Apple Silicon (M1/M2/M3/M4)
                "/usr/local/bin", // Homebrew – Intel Macs + manual installs
                "/opt/local/bin", // MacPorts
                "/usr/bin",
            ];
        case "linux":
            return ["/usr/local/bin", "/usr/bin", "/snap/bin", "/var/lib/flatpak/exports/bin"];
        default:
            return []; // Windows: PATH is inherited correctly
    }
})();
// Ask the user's login shell for its PATH. This is the standard workaround for
// the macOS "GUI app has no Homebrew" problem (same trick VS Code uses).
function getLoginShellDirs() {
    if (process.platform === "win32")
        return [];
    const shell = process.env.SHELL || "/bin/zsh";
    try {
        const result = (0, child_process_1.spawnSync)(shell, ["-ilc", 'echo "__PATH__=$PATH"'], { encoding: "utf8", timeout: 3000, stdio: ["ignore", "pipe", "ignore"] });
        const match = (result.stdout ?? "").match(/__PATH__=(.*)/);
        if (match)
            return match[1].split(path_1.default.delimiter).filter(Boolean);
    }
    catch {
        /* shell missing or hung — fall back to other sources */
    }
    return [];
}
const SEARCH_DIRS = (() => {
    const inherited = (process.env.PATH ?? "").split(path_1.default.delimiter).filter(Boolean);
    const merged = [...WELL_KNOWN_BINARY_DIRS, ...getLoginShellDirs(), ...inherited];
    const deduped = [...new Set(merged)];
    // Make the enriched PATH available to every child process we spawn.
    process.env.PATH = deduped.join(path_1.default.delimiter);
    return deduped;
})();
function resolveBinary(name) {
    const exe = process.platform === "win32" ? `${name}.exe` : name;
    for (const dir of SEARCH_DIRS) {
        const full = path_1.default.join(dir, exe);
        if ((0, fs_1.existsSync)(full))
            return full;
    }
    return exe; // last-resort: let the OS try (will ENOENT if truly absent)
}
// ── ffmpeg / ffprobe resolution ────────────────────────────────────────────────
// In production (packaged) builds we use the bundled ffmpeg-static / ffprobe-static
// binaries, which are unpacked from the asar archive into app.asar.unpacked/ by
// electron-forge (asarUnpack option in forge.config.js).
// In development we fall back to the system PATH resolution defined above.
function resolvePackagedBinaryPath(rawPath) {
    // node_modules sit inside app.asar but binaries are unpacked into
    // app.asar.unpacked — replace the asar root in the path accordingly.
    return rawPath.replace(/(app\.asar)([/\\])/g, "$1.unpacked$2");
}
let FFMPEG;
let FFPROBE;
if (electron_1.app.isPackaged) {
    // Production: use bundled static binaries
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ffmpegRaw = require("ffmpeg-static");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ffprobeRaw = require("ffprobe-static").path;
    FFMPEG = resolvePackagedBinaryPath(ffmpegRaw);
    FFPROBE = resolvePackagedBinaryPath(ffprobeRaw);
}
else {
    // Development: search system PATH
    FFMPEG = resolveBinary("ffmpeg");
    FFPROBE = resolveBinary("ffprobe");
}
const FFMPEG_AVAILABLE = (0, fs_1.existsSync)(FFMPEG) && (0, fs_1.existsSync)(FFPROBE);
const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
const logger = (0, logger_1.createLogger)("electron-main");
// Surface the resolved media binaries at startup.
if (FFMPEG_AVAILABLE) {
    logger.info("Resolved media binaries", {
        platform: process.platform,
        arch: process.arch,
        ffmpeg: FFMPEG,
        ffprobe: FFPROBE,
        source: electron_1.app.isPackaged ? "bundled (ffmpeg-static)" : "system PATH"
    });
}
else {
    logger.error("ffmpeg/ffprobe NOT FOUND — audio transcoding & subtitles will fail", {
        platform: process.platform,
        arch: process.arch,
        ffmpegPath: FFMPEG,
        ffprobePath: FFPROBE,
        source: electron_1.app.isPackaged ? "bundled (ffmpeg-static)" : "system PATH",
        hint: electron_1.app.isPackaged
            ? "Bundled binary not found — check asarUnpack config"
            : process.platform === "darwin"
                ? "Install with: brew install ffmpeg"
                : process.platform === "linux"
                    ? "Install with your package manager, e.g. sudo apt install ffmpeg"
                    : "Install ffmpeg and ensure it is on PATH",
        searchedDirs: electron_1.app.isPackaged ? [] : SEARCH_DIRS
    });
}
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
// The packaged app is served from file://, an origin YouTube's embedded player
// refuses to initialise for ("Erreur 153 / player configuration"). Present a
// valid YouTube referer/origin on requests to YouTube hosts only, so trailer
// embeds play while the IPTV provider requests are left untouched.
function configureYouTubeEmbedHeaders(win) {
    const filter = {
        urls: [
            "*://*.youtube.com/*",
            "*://*.youtube-nocookie.com/*",
            "*://*.ytimg.com/*",
            "*://*.googlevideo.com/*"
        ]
    };
    win.webContents.session.webRequest.onBeforeSendHeaders(filter, (details, callback) => {
        const requestHeaders = { ...details.requestHeaders };
        // A valid Referer is enough; setting Origin on a frame navigation makes the
        // embed player fail differently (error 152), so leave Origin untouched.
        requestHeaders["Referer"] = "https://www.youtube.com/";
        callback({ requestHeaders });
    });
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
    configureYouTubeEmbedHeaders(win);
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
// ── Auto-updater (Squirrel / macOS) ───────────────────────────────────────────
// Uses Electron's built-in autoUpdater pointed at GitHub Releases (Windows) or
// update.electronjs.org (macOS). Works only in packaged builds.
function setupAutoUpdater() {
    if (!electron_1.app.isPackaged)
        return;
    // Electron's autoUpdater only implements Windows (Squirrel.Windows) and macOS
    // (Squirrel.Mac). Linux has no autoUpdater — bail out before setFeedURL throws.
    if (process.platform !== "win32" && process.platform !== "darwin")
        return;
    const REPO = "amineflex/openiptv";
    // Windows: point Squirrel straight at the GitHub Release assets. GitHub's
    // `releases/latest/download/<asset>` always 302-redirects to the newest
    // published (non-draft, non-prerelease) release's asset, so Squirrel fetches
    // RELEASES and the referenced .nupkg with no extra hosting — and, crucially,
    // this works for an UNSIGNED app (update.electronjs.org rejects unsigned ones).
    // macOS: Squirrel.Mac needs a JSON feed AND a signed+notarized build;
    // update.electronjs.org provides the feed, but without signing it won't apply.
    const feedURL = process.platform === "win32"
        ? `https://github.com/${REPO}/releases/latest/download`
        : `https://update.electronjs.org/${REPO}/${process.platform}-${process.arch}/${electron_1.app.getVersion()}`;
    logger.info("Auto-updater feed configured", { feedURL, version: electron_1.app.getVersion() });
    try {
        electron_1.autoUpdater.setFeedURL({ url: feedURL });
    }
    catch (err) {
        logger.error("Auto-updater setFeedURL failed", { error: String(err) });
        return;
    }
    // Forward updater events to the renderer so the UI can react.
    electron_1.autoUpdater.on("checking-for-update", () => {
        logger.info("Auto-updater: checking for update");
    });
    electron_1.autoUpdater.on("update-available", () => {
        logger.info("Auto-updater: update available — downloading");
        const win = electron_1.BrowserWindow.getAllWindows()[0];
        win?.webContents.send("updater:available");
    });
    electron_1.autoUpdater.on("update-not-available", () => {
        logger.info("Auto-updater: app is up to date");
    });
    electron_1.autoUpdater.on("update-downloaded", (_event, releaseNotes, releaseName) => {
        logger.info("Auto-updater: update downloaded", { releaseName });
        const win = electron_1.BrowserWindow.getAllWindows()[0];
        win?.webContents.send("updater:downloaded", { releaseName, releaseNotes });
    });
    electron_1.autoUpdater.on("error", (err) => {
        logger.error("Auto-updater error", { error: err.message });
    });
    // Check on startup with a small delay to let the window finish loading.
    setTimeout(() => {
        try {
            electron_1.autoUpdater.checkForUpdates();
        }
        catch (err) {
            logger.error("Auto-updater checkForUpdates failed", { error: String(err) });
        }
    }, 8000);
    // Then re-check every hour.
    setInterval(() => {
        try {
            electron_1.autoUpdater.checkForUpdates();
        }
        catch { /* ignore */ }
    }, 60 * 60 * 1000);
}
// IPC: renderer requests to quit and install the downloaded update.
electron_1.ipcMain.handle("updater:quit-and-install", () => {
    logger.info("Auto-updater: quit and install requested by renderer");
    electron_1.autoUpdater.quitAndInstall();
});
electron_1.app.whenReady()
    .then(() => {
    logger.info("Electron app is ready");
    void loadDownloadsManifest();
    createWindow();
    setupAutoUpdater();
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
const TEXT_SUBTITLE_CODECS = new Set([
    "subrip", "srt", "ass", "ssa", "mov_text", "webvtt", "vtt", "text", "microdvd", "micro_dvd"
]);
// Bitmap subtitles are images: they can't become WebVTT, so the only way to
// show them in a Chromium <video> is to burn them into the picture with an
// ffmpeg overlay (hardsub) while transcoding.
const BITMAP_SUBTITLE_CODECS = new Set([
    "hdmv_pgs_subtitle", "pgssub", "dvd_subtitle", "dvdsub", "dvb_subtitle", "dvbsub", "xsub"
]);
const UNSUPPORTED_BROWSER_AUDIO_CODECS = new Set(["ac3", "eac3", "truehd", "dts", "dts_hd"]);
// Video codecs Chromium can decode through MSE (what mpegts.js feeds). When the
// source video is one of these, a VOD "transcode" only re-encodes the audio and
// copies the video — a few % of CPU instead of a full libx264 re-encode.
const MSE_COPYABLE_VIDEO_CODECS = new Set(["h264"]);
const transcodeSources = new Map();
const streamProxySources = new Map();
let transcodeServer = null;
let transcodeServerPort = null;
const mediaUsageCounters = new Map();
let lastNetworkSampleAt = Date.now();
let lastNetworkBytes = 0;
const childCpuSamples = new Map();
const activeTranscodes = new Set();
const activeTranscodeInfos = new Map();
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
    activeTranscodeInfos.delete(proc);
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
function probeAudioStreams(url, timeoutMs) {
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
        // Live sources can stall on a dead upstream — cap the probe so opening a
        // channel never hangs. VOD passes no timeout (finite files respond fast).
        const killTimer = timeoutMs ? setTimeout(() => { if (!proc.killed)
            proc.kill(); }, timeoutMs) : null;
        proc.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
        proc.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
        proc.on("close", (code) => {
            if (killTimer)
                clearTimeout(killTimer);
            if (code !== 0) {
                reject(new Error(stderr.trim() || `ffprobe exited with code ${code ?? "unknown"}`));
                return;
            }
            try {
                const parsed = JSON.parse(stdout);
                const streams = parsed.streams ?? [];
                const videoStream = streams.find((stream) => stream.codec_type === "video");
                const fmtName = parsed.format?.format_name ?? "";
                resolve({
                    streams: streams.filter((stream) => stream.codec_type === "audio"),
                    durationSeconds: parseDurationSeconds(parsed.format?.duration),
                    videoFps: parseFrameRate(videoStream?.avg_frame_rate) ?? parseFrameRate(videoStream?.r_frame_rate),
                    videoCodec: videoStream?.codec_name?.toLowerCase(),
                    isMpegTs: fmtName.split(",").some((f) => f.trim() === "mpegts")
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
            if (killTimer)
                clearTimeout(killTimer);
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
            if (requestUrl.pathname.startsWith("/download-sub/")) {
                handleDownloadSubtitleRequest(request, response, requestUrl);
                return;
            }
            if (requestUrl.pathname.startsWith("/download/")) {
                handleDownloadFileRequest(request, response, requestUrl);
                return;
            }
            const match = requestUrl.pathname.match(/^\/transcode\/([^/]+)$/);
            const startTime = Math.max(0, Number(requestUrl.searchParams.get("start") ?? 0) || 0);
            const audioIndex = Math.max(0, Math.trunc(Number(requestUrl.searchParams.get("audio") ?? 0)) || 0);
            // Optional bitmap subtitle (PGS/DVD/DVB) to burn into the picture, given
            // as a subtitle-relative index (ffmpeg's 0:s:N). Absent for normal playback.
            const subtitleParam = requestUrl.searchParams.get("subtitle");
            const burnSubtitleIndex = subtitleParam != null && /^\d+$/.test(subtitleParam)
                ? Number(subtitleParam)
                : null;
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
            // VOD with an MSE-decodable video codec and no burned-in subtitle: copy
            // the video stream untouched (like the live path) and only re-encode the
            // audio. Seeking becomes keyframe-accurate instead of frame-accurate,
            // but CPU drops from a full libx264 re-encode to a remux.
            const canCopyVideo = !transcodeSource.live
                && burnSubtitleIndex === null
                && MSE_COPYABLE_VIDEO_CODECS.has(transcodeSource.videoCodec ?? "");
            let args;
            if (transcodeSource.live) {
                // Live: the video already plays fine in mpegts.js — only the
                // AC3/E-AC3/DTS audio is undecodable. Copy the video untouched (cheap,
                // low-latency, no quality loss) and re-encode just the audio to AAC.
                // No -ss/PTS-normalization: a live feed is continuous and never seeks.
                // Reconnect flags keep the upstream fetch alive across brief hiccups.
                args = [
                    "-hide_banner",
                    "-loglevel", "error",
                    "-fflags", "+genpts+discardcorrupt",
                    "-reconnect", "1",
                    "-reconnect_streamed", "1",
                    "-reconnect_delay_max", "5",
                    "-i", sourceUrl,
                    "-map", "0:v:0?",
                    "-map", "0:a?",
                    "-c:v", "copy",
                    "-c:a", "aac",
                    "-ac", "2",
                    "-b:a", "192k",
                    "-muxdelay", "0",
                    "-muxpreload", "0",
                    "-mpegts_flags", "+resend_headers",
                    "-f", "mpegts",
                    "pipe:1"
                ];
            }
            else {
                // Shared VOD input flags.
                // +discardcorrupt: skip corrupt packets from a flaky IPTV server
                // instead of aborting the whole transcode on the first bad byte.
                // Reconnect flags: many IPTV VOD hosts drop or idle-close the
                // connection mid-file. Without these the read errors out, ffmpeg
                // exits, the stdout pipe closes and playback stalls/restarts. Let
                // ffmpeg silently re-open the HTTP source (and re-seek for byte-range
                // inputs) so a transient drop never kills the pipe.
                const inputArgs = [
                    "-hide_banner",
                    "-loglevel", "error",
                    "-fflags", "+genpts+discardcorrupt",
                    "-reconnect", "1",
                    "-reconnect_streamed", "1",
                    "-reconnect_delay_max", "5",
                    ...(startTime > 0 ? ["-ss", startTime.toFixed(3)] : []),
                    "-i", sourceUrl
                ];
                const outputArgs = [
                    "-c:a", "aac",
                    "-ac", "2",
                    "-b:a", "192k",
                    "-muxdelay", "0",
                    "-muxpreload", "0",
                    "-mpegts_flags", "+resend_headers",
                    "-f", "mpegts",
                    "pipe:1"
                ];
                if (canCopyVideo) {
                    // Remux: copy the H.264 video as-is and re-encode only the audio.
                    // No PTS filter (copy can't be filtered) — mpegts.js normalizes
                    // timestamps itself, exactly like the live path relies on.
                    args = [
                        ...inputArgs,
                        "-map", "0:v:0?",
                        "-map", `0:a:${audioIndex}?`,
                        "-c:v", "copy",
                        ...outputArgs
                    ];
                }
                else {
                    // Full re-encode. Normalize the video timeline to a clean CFR-ish
                    // PTS so mpegts.js and the seek/resume bookkeeping behave. When
                    // burning a bitmap subtitle, overlay it first (using the source's
                    // native, mutually-consistent timestamps so it stays in sync) and
                    // normalize the combined result; eof_action=pass lets the video
                    // continue once the subtitle stream ends.
                    const setptsExpr = `settb=AVTB,setpts=N/((${videoFps})*TB)`;
                    const videoArgs = burnSubtitleIndex !== null
                        ? [
                            "-filter_complex",
                            `[0:v:0][0:s:${burnSubtitleIndex}]overlay=eof_action=pass[ov];[ov]${setptsExpr}[v]`,
                            "-map", "[v]"
                        ]
                        : [
                            "-map", "0:v:0?",
                            "-vf", setptsExpr
                        ];
                    args = [
                        ...inputArgs,
                        ...videoArgs,
                        "-map", `0:a:${audioIndex}?`,
                        "-c:v", "libx264",
                        "-preset", "veryfast",
                        "-crf", "23",
                        "-pix_fmt", "yuv420p",
                        "-af", "aresample=async=1:first_pts=0,asetpts=N/SR/TB",
                        ...outputArgs
                    ];
                }
            }
            const proc = (0, child_process_1.spawn)(FFMPEG, args);
            activeTranscodes.add(proc);
            activeTranscodeInfos.set(proc, {
                sourceId: match[1],
                mode: transcodeSource.live ? "live" : "vod",
                startedAt: Date.now(),
                startSeconds: transcodeSource.live ? undefined : startTime,
                audioIndex: transcodeSource.live ? undefined : audioIndex,
                burnSubtitleIndex: burnSubtitleIndex ?? undefined,
                videoCodec: transcodeSource.live || canCopyVideo ? "copy" : "libx264",
                audioCodec: "aac"
            });
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
                activeTranscodeInfos.delete(proc);
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
async function createTranscodedAudioUrl(sourceUrl, videoFps, videoCodec) {
    const port = await ensureTranscodeServer();
    const id = (0, crypto_1.randomUUID)();
    transcodeSources.set(id, { url: sourceUrl, videoFps, videoCodec });
    getOrCreateMediaCounter(id);
    logger.debug("Created local transcode source", {
        sourceId: id,
        sourceUrl,
        videoFps,
        videoCodec
    });
    return `http://127.0.0.1:${port}/transcode/${id}`;
}
async function createLiveTranscodeUrl(sourceUrl) {
    const port = await ensureTranscodeServer();
    const id = (0, crypto_1.randomUUID)();
    transcodeSources.set(id, { url: sourceUrl, live: true });
    getOrCreateMediaCounter(id);
    logger.debug("Created live transcode source", {
        sourceId: id,
        sourceUrl
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
                if (stdout.trim().length === 0) {
                    // ffprobe produced nothing (missing binary, unreachable URL…).
                    resolve({ ok: false, tracks: [], error: stderr.trim() || "No probe output" });
                    return;
                }
                const parsed = JSON.parse(stdout);
                const streams = parsed.streams ?? [];
                const tracks = streams
                    .map((stream, relativeIndex) => ({ stream, relativeIndex }))
                    .filter(({ stream }) => {
                    const codec = (stream.codec_name ?? "").toLowerCase();
                    return TEXT_SUBTITLE_CODECS.has(codec) || BITMAP_SUBTITLE_CODECS.has(codec);
                })
                    .map(({ stream, relativeIndex }) => {
                    const codec = (stream.codec_name ?? "").toLowerCase();
                    const language = (stream.tags?.language ?? "und").slice(0, 3);
                    const label = stream.tags?.title?.trim()
                        || (language !== "und" ? language.toUpperCase() : `Track ${stream.index}`);
                    return {
                        id: `embedded:${stream.index}`,
                        index: stream.index,
                        relativeIndex,
                        codec: stream.codec_name ?? "",
                        language,
                        label,
                        bitmap: BITMAP_SUBTITLE_CODECS.has(codec)
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
        // Cap the probe so a dead VOD host can't hang the open forever.
        const probeResult = await probeAudioStreams(url, 20000);
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
            // Play natively, but still hand back a transcode base URL so the renderer
            // can switch into a re-encode on demand if the user picks a bitmap
            // subtitle that has to be burned into the picture.
            const transcodeBaseUrl = await createTranscodedAudioUrl(url, probeResult.videoFps, probeResult.videoCodec);
            return {
                ok: true,
                url,
                transcoded: false,
                audioCodecs,
                audioTracks,
                transcodeBaseUrl,
                defaultAudioIndex,
                durationSeconds: probeResult.durationSeconds,
                // Chromium cannot play MPEG-TS via <video src> — the renderer must
                // use mpegts.js (MSE) even though no audio re-encode is needed.
                requiresMpegTsPlayer: probeResult.isMpegTs
            };
        }
        const transcodeBaseUrl = await createTranscodedAudioUrl(url, probeResult.videoFps, probeResult.videoCodec);
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
electron_1.ipcMain.handle("media:resolve-live-stream", async (_event, rawUrl) => {
    let url;
    try {
        url = assertHttpUrl(rawUrl);
    }
    catch (error) {
        logger.warn("Rejected live stream resolve request", {
            error: error instanceof Error ? error.message : "Invalid URL"
        });
        return { ok: false, url: "", transcoded: false, error: error instanceof Error ? error.message : "Invalid URL" };
    }
    try {
        const probeResult = await probeAudioStreams(url, 12000);
        if (!shouldTranscodeAudio(probeResult.streams)) {
            // AAC/MP3 audio — mpegts.js plays it directly, no transcode needed.
            return { ok: true, url, transcoded: false };
        }
        // AC3/E-AC3/DTS: mpegts.js drops these audio packets (no audio). Route the
        // channel through the local audio-only transcode instead.
        const transcodeUrl = await createLiveTranscodeUrl(url);
        return { ok: true, url: transcodeUrl, transcoded: true };
    }
    catch (error) {
        // Probe failed (unreachable/slow upstream) — fall back to direct playback so
        // AAC channels still work even when we couldn't inspect the codec.
        logger.warn("Live stream audio probe failed; using direct playback", {
            error: error instanceof Error ? error.message : String(error),
            url
        });
        return { ok: true, url, transcoded: false };
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
async function getFfmpegServerStats() {
    const now = Date.now();
    const childProcesses = await getChildProcessUsages();
    const childProcessByPid = new Map(childProcesses.map((usage) => [usage.pid, usage]));
    const sessions = [];
    for (const [proc, info] of activeTranscodeInfos.entries()) {
        const counter = mediaUsageCounters.get(info.sourceId);
        const outputBytes = counter?.bytesTransferred ?? 0;
        const uptimeSeconds = Math.max(0.001, (now - info.startedAt) / 1000);
        const pid = proc.pid;
        const processUsage = typeof pid === "number" ? childProcessByPid.get(pid) : undefined;
        sessions.push({
            sourceId: info.sourceId,
            pid,
            mode: info.mode,
            uptimeSeconds: Math.round(uptimeSeconds),
            startSeconds: info.startSeconds,
            audioIndex: info.audioIndex,
            burnSubtitleIndex: info.burnSubtitleIndex,
            videoCodec: info.videoCodec,
            audioCodec: info.audioCodec,
            outputKbps: Math.round((outputBytes * 8) / 1000 / uptimeSeconds),
            outputMB: Math.round((outputBytes / 1024 / 1024) * 10) / 10,
            activeRequests: counter?.activeRequests ?? 0,
            cpuPercent: processUsage?.cpuPercent,
            ramMB: processUsage?.ramMB
        });
    }
    let totalOutputBytes = 0;
    let activeRequestCount = 0;
    for (const id of transcodeSources.keys()) {
        const counter = mediaUsageCounters.get(id);
        if (!counter)
            continue;
        totalOutputBytes += counter.bytesTransferred;
        activeRequestCount += counter.activeRequests;
    }
    return {
        available: FFMPEG_AVAILABLE,
        serverRunning: transcodeServerPort !== null,
        port: transcodeServerPort ?? undefined,
        sourceCount: transcodeSources.size,
        proxyCount: streamProxySources.size,
        activeSessionCount: sessions.length,
        activeRequestCount,
        totalOutputMB: Math.round((totalOutputBytes / 1024 / 1024) * 10) / 10,
        sessions
    };
}
electron_1.ipcMain.handle("stats:get-app-usage", () => getAppUsageStats());
electron_1.ipcMain.handle("stats:get-ffmpeg", () => getFfmpegServerStats());
// Open an http(s) URL in the user's default browser (e.g. a trailer that the
// in-app embed can't play). Restricted to web protocols for safety.
electron_1.ipcMain.handle("shell:open-external", async (_event, rawUrl) => {
    if (typeof rawUrl !== "string")
        return { ok: false };
    try {
        const url = new URL(rawUrl);
        if (url.protocol !== "http:" && url.protocol !== "https:")
            return { ok: false };
        await electron_1.shell.openExternal(url.toString());
        return { ok: true };
    }
    catch {
        return { ok: false };
    }
});
// ── Downloads (offline, Netflix-style) ────────────────────────────────────────
// Media is saved under <userData>/Downloads so it lives in the OS app-data dir
// (and survives app updates). A small JSON manifest in userData tracks each
// download's metadata + status, so the UI can show live progress and an
// "already downloaded" state across restarts. The raw VOD/episode file is saved
// as-is (no transcoding) — exactly the container the server serves.
const DOWNLOADS_DIR = path_1.default.join(electron_1.app.getPath("userData"), "Downloads");
const DOWNLOADS_MANIFEST = path_1.default.join(electron_1.app.getPath("userData"), "downloads.json");
const MAX_DOWNLOAD_REDIRECTS = 5;
const DOWNLOAD_PROGRESS_INTERVAL_MS = 400;
// Some IPTV servers gate VOD on a non-empty User-Agent; mimic a desktop client.
const DOWNLOAD_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const downloadRecords = new Map();
const activeDownloads = new Map();
let manifestWriteTimer = null;
function broadcast(channel, payload) {
    for (const win of electron_1.BrowserWindow.getAllWindows()) {
        win.webContents.send(channel, payload);
    }
}
// Strip characters illegal on Windows/macOS/Linux filesystems and trailing dots.
function sanitizeSegment(value) {
    // Drop control characters (charCode < 0x20) first — done in a loop rather
    // than a control-char regex literal, which ESLint's no-control-regex forbids.
    let stripped = "";
    for (const char of value) {
        stripped += char.charCodeAt(0) < 0x20 ? " " : char;
    }
    const cleaned = stripped
        .replace(/[<>:"/\\|?*]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/[. ]+$/, "");
    return cleaned.slice(0, 120) || "untitled";
}
function buildDownloadFilePath(input) {
    const ext = (input.container || "mp4").replace(/[^a-z0-9]/gi, "").toLowerCase() || "mp4";
    if (input.kind === "episode") {
        const series = sanitizeSegment(input.seriesTitle || input.title || "Series");
        const season = sanitizeSegment(`Season ${input.season ?? "1"}`);
        const epNum = input.episodeNum !== undefined ? `E${String(input.episodeNum).padStart(2, "0")} - ` : "";
        const file = sanitizeSegment(`${epNum}${input.title || "Episode"}`);
        return path_1.default.join(DOWNLOADS_DIR, "Series", series, season, `${file}.${ext}`);
    }
    const file = sanitizeSegment(input.title || "Movie");
    return path_1.default.join(DOWNLOADS_DIR, "Movies", `${file}.${ext}`);
}
const CONTENT_TYPES = {
    mp4: "video/mp4",
    m4v: "video/mp4",
    mkv: "video/x-matroska",
    webm: "video/webm",
    ts: "video/mp2t",
    mpg: "video/mpeg",
    mpeg: "video/mpeg",
    avi: "video/x-msvideo",
    mov: "video/quicktime",
    wmv: "video/x-ms-wmv",
    flv: "video/x-flv",
    vtt: "text/vtt",
    srt: "application/x-subrip",
    ass: "text/plain",
    ssa: "text/plain",
    sub: "text/plain"
};
function contentTypeForPath(filePath) {
    const ext = path_1.default.extname(filePath).slice(1).toLowerCase();
    return CONTENT_TYPES[ext] ?? "application/octet-stream";
}
// Serve a local file over the media server with HTTP Range support, so the
// renderer's <video> (and ffmpeg, when it transcodes) can seek into downloads
// exactly like a remote stream.
function serveStaticFile(request, response, filePath) {
    let fileSize;
    try {
        fileSize = (0, fs_1.statSync)(filePath).size;
    }
    catch {
        response.writeHead(404);
        response.end();
        return;
    }
    const headers = {
        "Access-Control-Allow-Origin": "*",
        "Accept-Ranges": "bytes",
        "Content-Type": contentTypeForPath(filePath),
        "Cache-Control": "no-store"
    };
    if (request.method === "HEAD") {
        response.writeHead(200, { ...headers, "Content-Length": String(fileSize) });
        response.end();
        return;
    }
    const rangeMatch = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range ?? "");
    if (rangeMatch) {
        let start = rangeMatch[1] ? Number(rangeMatch[1]) : 0;
        let end = rangeMatch[2] ? Number(rangeMatch[2]) : fileSize - 1;
        if (!Number.isFinite(start))
            start = 0;
        if (!Number.isFinite(end) || end >= fileSize)
            end = fileSize - 1;
        if (start > end || start >= fileSize) {
            response.writeHead(416, { ...headers, "Content-Range": `bytes */${fileSize}` });
            response.end();
            return;
        }
        response.writeHead(206, {
            ...headers,
            "Content-Range": `bytes ${start}-${end}/${fileSize}`,
            "Content-Length": String(end - start + 1)
        });
        const stream = (0, fs_1.createReadStream)(filePath, { start, end });
        stream.on("error", () => response.destroy());
        response.on("close", () => stream.destroy());
        stream.pipe(response);
        return;
    }
    response.writeHead(200, { ...headers, "Content-Length": String(fileSize) });
    const stream = (0, fs_1.createReadStream)(filePath);
    stream.on("error", () => response.destroy());
    response.on("close", () => stream.destroy());
    stream.pipe(response);
}
function handleDownloadFileRequest(request, response, requestUrl) {
    const id = decodeURIComponent(requestUrl.pathname.slice("/download/".length));
    const record = downloadRecords.get(id);
    if (!record || record.status !== "completed" || !(0, fs_1.existsSync)(record.filePath)) {
        response.writeHead(404);
        response.end();
        return;
    }
    serveStaticFile(request, response, record.filePath);
}
function handleDownloadSubtitleRequest(request, response, requestUrl) {
    const [rawId, rawIndex] = requestUrl.pathname.slice("/download-sub/".length).split("/");
    const record = downloadRecords.get(decodeURIComponent(rawId ?? ""));
    const sub = record?.subtitles?.[Number(rawIndex)];
    if (!sub || !(0, fs_1.existsSync)(sub.filePath)) {
        response.writeHead(404);
        response.end();
        return;
    }
    serveStaticFile(request, response, sub.filePath);
}
// Buffer a (small) URL fully into memory — used for subtitle sidecars, which are
// tiny. Follows redirects the same way the proxy/video downloader does.
function fetchUrlToBuffer(rawUrl, redirectCount = 0) {
    return new Promise((resolve, reject) => {
        let url;
        try {
            url = new URL(rawUrl);
        }
        catch {
            reject(new Error("Invalid URL"));
            return;
        }
        const transport = url.protocol === "https:" ? https_1.default : http_1.default;
        const req = transport.request(url, { method: "GET", headers: createForwardHeaders({ "user-agent": DOWNLOAD_USER_AGENT }, url) }, (res) => {
            const status = res.statusCode ?? 0;
            const location = res.headers.location;
            if (location && [301, 302, 303, 307, 308].includes(status) && redirectCount < MAX_DOWNLOAD_REDIRECTS) {
                res.resume();
                fetchUrlToBuffer(new URL(location, url).toString(), redirectCount + 1).then(resolve, reject);
                return;
            }
            if (status < 200 || status >= 300) {
                res.resume();
                reject(new Error(`HTTP ${status}`));
                return;
            }
            const chunks = [];
            res.on("data", (chunk) => chunks.push(chunk));
            res.on("end", () => resolve(Buffer.concat(chunks)));
            res.on("error", reject);
        });
        req.on("error", reject);
        req.end();
    });
}
function subtitleExtFromUrl(rawUrl) {
    try {
        const match = new URL(rawUrl).pathname.toLowerCase().match(/\.(srt|vtt|ass|ssa|sub)$/);
        if (match)
            return match[1];
    }
    catch {
        /* not a parseable URL — fall through */
    }
    return "srt";
}
// Fetch each external subtitle and save it as a sidecar named like the video
// (`<base>.<lang>.<ext>`) so OS players auto-load it. Best-effort: a failed
// subtitle is logged and skipped, never failing the (already saved) video.
async function downloadSubtitlesFor(record, inputs) {
    if (!inputs.length)
        return;
    const base = record.filePath.replace(/\.[^/.\\]+$/, "");
    const saved = [];
    const usedPaths = new Set();
    for (const sub of inputs) {
        try {
            const lang = (sub.language || "und").replace(/[^a-z0-9]/gi, "").toLowerCase().slice(0, 8) || "und";
            const ext = subtitleExtFromUrl(sub.url);
            let target = `${base}.${lang}.${ext}`;
            for (let n = 2; usedPaths.has(target); n++)
                target = `${base}.${lang}.${n}.${ext}`;
            usedPaths.add(target);
            const buffer = await fetchUrlToBuffer(sub.url);
            await (0, promises_1.writeFile)(target, buffer);
            saved.push({ language: sub.language, label: sub.label, filePath: target });
        }
        catch (err) {
            logger.warn("Failed to download subtitle", { url: sub.url, error: String(err) });
        }
    }
    if (saved.length) {
        record.subtitles = saved;
        emitChanged(record);
    }
}
function scheduleManifestSave() {
    if (manifestWriteTimer)
        return;
    manifestWriteTimer = setTimeout(() => {
        manifestWriteTimer = null;
        void (0, promises_1.writeFile)(DOWNLOADS_MANIFEST, JSON.stringify([...downloadRecords.values()], null, 2)).catch((err) => logger.warn("Failed to persist downloads manifest", { error: String(err) }));
    }, 250);
    manifestWriteTimer.unref();
}
async function loadDownloadsManifest() {
    try {
        const raw = await (0, promises_1.readFile)(DOWNLOADS_MANIFEST, "utf8");
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed))
            return;
        for (const record of parsed) {
            if (!record || typeof record.id !== "string")
                continue;
            // Anything still "in-flight" was cut short by a previous quit/crash.
            if (record.status === "downloading" || record.status === "queued") {
                record.status = "error";
                record.error = "Interrupted";
            }
            downloadRecords.set(record.id, record);
        }
        logger.info("Loaded downloads manifest", { count: downloadRecords.size });
    }
    catch {
        /* no manifest yet — first run */
    }
}
function emitChanged(record) {
    scheduleManifestSave();
    broadcast("downloads:changed", record);
}
function startDownload(record, subtitleInputs = []) {
    const partPath = `${record.filePath}.part`;
    const active = { partPath, canceled: false, cancel: () => undefined };
    activeDownloads.set(record.id, active);
    let request = null;
    let fileStream = null;
    let settled = false;
    const fail = (message) => {
        if (settled)
            return;
        settled = true;
        activeDownloads.delete(record.id);
        try {
            fileStream?.destroy();
        }
        catch { /* already closed */ }
        try {
            request?.destroy();
        }
        catch { /* already closed */ }
        void (0, promises_1.unlink)(partPath).catch(() => { });
        record.status = active.canceled ? "canceled" : "error";
        record.error = active.canceled ? undefined : message;
        emitChanged(record);
    };
    const complete = () => {
        if (settled)
            return;
        settled = true;
        activeDownloads.delete(record.id);
        void (0, promises_1.rename)(partPath, record.filePath)
            .then(() => {
            record.status = "completed";
            record.completedAt = new Date().toISOString();
            if (!record.total)
                record.total = record.received;
            emitChanged(record);
            // Pull subtitle sidecars after the video lands (best-effort).
            void downloadSubtitlesFor(record, subtitleInputs);
        })
            .catch((err) => {
            record.status = "error";
            record.error = err instanceof Error ? err.message : String(err);
            void (0, promises_1.unlink)(partPath).catch(() => undefined);
            emitChanged(record);
        });
    };
    active.cancel = () => {
        active.canceled = true;
        fail("Canceled");
    };
    void (0, promises_1.mkdir)(path_1.default.dirname(record.filePath), { recursive: true })
        .then(() => {
        if (active.canceled)
            return;
        fileStream = (0, fs_1.createWriteStream)(partPath);
        fileStream.on("error", (err) => fail(err.message));
        fileStream.on("finish", complete);
        let lastEmit = 0;
        let lastBytes = 0;
        let lastBytesTime = Date.now();
        const open = (sourceUrl, redirectCount) => {
            if (active.canceled)
                return;
            let remoteUrl;
            try {
                remoteUrl = new URL(sourceUrl);
            }
            catch {
                fail("Invalid URL");
                return;
            }
            const transport = remoteUrl.protocol === "https:" ? https_1.default : http_1.default;
            request = transport.request(remoteUrl, {
                method: "GET",
                headers: createForwardHeaders({ "user-agent": DOWNLOAD_USER_AGENT }, remoteUrl)
            }, (res) => {
                const statusCode = res.statusCode ?? 0;
                const location = res.headers.location;
                if (location
                    && [301, 302, 303, 307, 308].includes(statusCode)
                    && redirectCount < MAX_DOWNLOAD_REDIRECTS) {
                    res.resume();
                    open(new URL(location, remoteUrl).toString(), redirectCount + 1);
                    return;
                }
                if (statusCode < 200 || statusCode >= 300) {
                    res.resume();
                    fail(`HTTP ${statusCode}`);
                    return;
                }
                record.total = Number(res.headers["content-length"]) || 0;
                record.status = "downloading";
                emitChanged(record);
                res.on("data", (chunk) => {
                    record.received += chunk.length;
                    const now = Date.now();
                    if (now - lastEmit < DOWNLOAD_PROGRESS_INTERVAL_MS)
                        return;
                    const secs = (now - lastBytesTime) / 1000;
                    const bytesPerSecond = secs > 0 ? (record.received - lastBytes) / secs : 0;
                    lastEmit = now;
                    lastBytes = record.received;
                    lastBytesTime = now;
                    broadcast("downloads:progress", {
                        id: record.id,
                        received: record.received,
                        total: record.total,
                        percent: record.total > 0 ? Math.min(100, (record.received / record.total) * 100) : -1,
                        bytesPerSecond
                    });
                });
                res.on("error", (err) => fail(err.message));
                if (fileStream)
                    res.pipe(fileStream);
            });
            request.on("error", (err) => fail(err.message));
            request.end();
        };
        open(record.url, 0);
    })
        .catch((err) => fail(err instanceof Error ? err.message : String(err)));
}
electron_1.ipcMain.handle("downloads:list", () => [...downloadRecords.values()]);
electron_1.ipcMain.handle("downloads:start", (_event, input) => {
    if (!input || typeof input.id !== "string" || typeof input.url !== "string") {
        return { ok: false, error: "Invalid download request" };
    }
    // Already running, or already on disk — hand back the current record.
    if (activeDownloads.has(input.id)) {
        return { ok: true, record: downloadRecords.get(input.id) };
    }
    const existing = downloadRecords.get(input.id);
    if (existing && existing.status === "completed" && (0, fs_1.existsSync)(existing.filePath)) {
        return { ok: true, record: existing };
    }
    let url;
    try {
        url = assertHttpUrl(input.url);
    }
    catch {
        return { ok: false, error: "Invalid URL" };
    }
    const record = {
        id: input.id,
        streamId: input.streamId,
        kind: input.kind,
        title: input.title,
        subtitle: input.subtitle,
        image: input.image,
        url,
        container: input.container,
        filePath: buildDownloadFilePath(input),
        status: "queued",
        received: 0,
        total: 0,
        createdAt: new Date().toISOString(),
        seriesId: input.seriesId,
        seriesTitle: input.seriesTitle,
        season: input.season,
        episodeNum: input.episodeNum,
        route: input.route,
        subtitleSources: input.subtitles
    };
    downloadRecords.set(record.id, record);
    emitChanged(record);
    startDownload(record, input.subtitles ?? []);
    return { ok: true, record };
});
electron_1.ipcMain.handle("downloads:cancel", (_event, id) => {
    if (typeof id !== "string")
        return { ok: false };
    activeDownloads.get(id)?.cancel();
    return { ok: true, record: downloadRecords.get(id) };
});
electron_1.ipcMain.handle("downloads:delete", async (_event, id) => {
    if (typeof id !== "string")
        return { ok: false };
    activeDownloads.get(id)?.cancel();
    const record = downloadRecords.get(id);
    if (record) {
        await (0, promises_1.unlink)(record.filePath).catch(() => undefined);
        await (0, promises_1.unlink)(`${record.filePath}.part`).catch(() => undefined);
        for (const sub of record.subtitles ?? []) {
            await (0, promises_1.unlink)(sub.filePath).catch(() => undefined);
        }
        downloadRecords.delete(id);
        scheduleManifestSave();
        broadcast("downloads:removed", { id });
    }
    return { ok: true };
});
// Resolve a completed download to localhost URLs (video + subtitle sidecars) so
// it can be played inside the app's own player, through the same pipeline as a
// remote stream (audio transcode, seeking, subtitle rendering all reused).
electron_1.ipcMain.handle("downloads:playback", async (_event, id) => {
    if (typeof id !== "string")
        return { ok: false, error: "Invalid id" };
    const record = downloadRecords.get(id);
    if (!record || record.status !== "completed" || !(0, fs_1.existsSync)(record.filePath)) {
        return { ok: false, error: "Download not available" };
    }
    let port;
    try {
        port = await ensureTranscodeServer();
    }
    catch {
        return { ok: false, error: "Local media server failed to start" };
    }
    const base = `http://127.0.0.1:${port}`;
    const subtitles = (record.subtitles ?? []).map((sub, index) => ({
        id: `download-sub:${id}:${index}`,
        label: sub.label,
        language: sub.language,
        src: `${base}/download-sub/${encodeURIComponent(id)}/${index}`
    }));
    return { ok: true, url: `${base}/download/${encodeURIComponent(id)}`, subtitles };
});
electron_1.ipcMain.handle("downloads:open-file", async (_event, id) => {
    if (typeof id !== "string")
        return { ok: false };
    const record = downloadRecords.get(id);
    if (!record || !(0, fs_1.existsSync)(record.filePath))
        return { ok: false, error: "File not found" };
    const err = await electron_1.shell.openPath(record.filePath);
    return { ok: !err, error: err || undefined };
});
electron_1.ipcMain.handle("downloads:reveal", async (_event, id) => {
    if (typeof id === "string") {
        const record = downloadRecords.get(id);
        if (record && (0, fs_1.existsSync)(record.filePath)) {
            electron_1.shell.showItemInFolder(record.filePath);
            return { ok: true };
        }
    }
    // Fall back to the Downloads root if the specific file is gone.
    await (0, promises_1.mkdir)(DOWNLOADS_DIR, { recursive: true }).catch(() => undefined);
    const err = await electron_1.shell.openPath(DOWNLOADS_DIR);
    return { ok: !err, error: err || undefined };
});
electron_1.ipcMain.handle("downloads:open-folder", async () => {
    await (0, promises_1.mkdir)(DOWNLOADS_DIR, { recursive: true }).catch(() => undefined);
    const err = await electron_1.shell.openPath(DOWNLOADS_DIR);
    return { ok: !err, error: err || undefined };
});
electron_1.app.on("before-quit", () => {
    logger.info("Electron app is quitting");
    killAllTranscodes();
    streamProxySources.clear();
    transcodeSources.clear();
    mediaUsageCounters.clear();
    transcodeServer?.close();
    transcodeServer = null;
    transcodeServerPort = null;
    // Tear down in-flight downloads and flush the manifest synchronously — the
    // debounced async save won't survive the quit.
    for (const active of [...activeDownloads.values()])
        active.cancel();
    try {
        (0, fs_1.writeFileSync)(DOWNLOADS_MANIFEST, JSON.stringify([...downloadRecords.values()], null, 2));
    }
    catch {
        /* best-effort */
    }
});
