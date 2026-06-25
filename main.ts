// ── Squirrel.Windows lifecycle ────────────────────────────────────────────────
// Must be the very first executable code — Squirrel relaunches the exe with
// --squirrel-* flags during install/update/uninstall. If we don't exit here,
// a ghost window briefly appears during installation.
import started from "electron-squirrel-startup";
// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
if (started) { process.exit(0); }

import { app, autoUpdater, BrowserWindow, ipcMain } from "electron";
import path from "path";
import { existsSync } from "fs";
import { spawn, spawnSync } from "child_process";
import http from "http";
import https from "https";
import type { IncomingHttpHeaders, ServerResponse } from "http";
import { randomUUID } from "crypto";
import { createLogger } from "./src/services/logger";

// ── Binary resolution ─────────────────────────────────────────────────────────
// Electron GUI apps launched from Finder/Dock on macOS (and some Linux DEs) get
// a stripped PATH that never sourced the user's shell profile — so Homebrew,
// MacPorts, Nix, asdf… are invisible. We resolve media binaries from three
// sources: well-known install dirs, the login shell's real PATH, and our own
// inherited PATH. The merged PATH is also pushed back onto process.env.PATH so
// every spawned ffmpeg/ffprobe child inherits it too.

const WELL_KNOWN_BINARY_DIRS: string[] = (() => {
	switch (process.platform) {
		case "darwin":
			return [
				"/opt/homebrew/bin",    // Homebrew – Apple Silicon (M1/M2/M3/M4)
				"/usr/local/bin",       // Homebrew – Intel Macs + manual installs
				"/opt/local/bin",       // MacPorts
				"/usr/bin",
			];
		case "linux":
			return ["/usr/local/bin", "/usr/bin", "/snap/bin", "/var/lib/flatpak/exports/bin"];
		default:
			return [];                  // Windows: PATH is inherited correctly
	}
})();

// Ask the user's login shell for its PATH. This is the standard workaround for
// the macOS "GUI app has no Homebrew" problem (same trick VS Code uses).
function getLoginShellDirs(): string[] {
	if (process.platform === "win32") return [];
	const shell = process.env.SHELL || "/bin/zsh";
	try {
		const result = spawnSync(
			shell,
			["-ilc", 'echo "__PATH__=$PATH"'],
			{ encoding: "utf8", timeout: 3000, stdio: ["ignore", "pipe", "ignore"] }
		);
		const match = (result.stdout ?? "").match(/__PATH__=(.*)/);
		if (match) return match[1].split(path.delimiter).filter(Boolean);
	} catch {
		/* shell missing or hung — fall back to other sources */
	}
	return [];
}

const SEARCH_DIRS: string[] = (() => {
	const inherited = (process.env.PATH ?? "").split(path.delimiter).filter(Boolean);
	const merged = [...WELL_KNOWN_BINARY_DIRS, ...getLoginShellDirs(), ...inherited];
	const deduped = [...new Set(merged)];
	// Make the enriched PATH available to every child process we spawn.
	process.env.PATH = deduped.join(path.delimiter);
	return deduped;
})();

function resolveBinary(name: string): string {
	const exe = process.platform === "win32" ? `${name}.exe` : name;
	for (const dir of SEARCH_DIRS) {
		const full = path.join(dir, exe);
		if (existsSync(full)) return full;
	}
	return exe; // last-resort: let the OS try (will ENOENT if truly absent)
}

// ── ffmpeg / ffprobe resolution ────────────────────────────────────────────────
// In production (packaged) builds we use the bundled ffmpeg-static / ffprobe-static
// binaries, which are unpacked from the asar archive into app.asar.unpacked/ by
// electron-forge (asarUnpack option in forge.config.js).
// In development we fall back to the system PATH resolution defined above.

function resolvePackagedBinaryPath(rawPath: string): string {
	// node_modules sit inside app.asar but binaries are unpacked into
	// app.asar.unpacked — replace the asar root in the path accordingly.
	return rawPath.replace(/(app\.asar)([/\\])/g, "$1.unpacked$2");
}

let FFMPEG: string;
let FFPROBE: string;

if (app.isPackaged) {
	// Production: use bundled static binaries
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	const ffmpegRaw = require("ffmpeg-static") as string;
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	const ffprobeRaw = (require("ffprobe-static") as { path: string }).path;
	FFMPEG  = resolvePackagedBinaryPath(ffmpegRaw);
	FFPROBE = resolvePackagedBinaryPath(ffprobeRaw);
} else {
	// Development: search system PATH
	FFMPEG  = resolveBinary("ffmpeg");
	FFPROBE = resolveBinary("ffprobe");
}

const FFMPEG_AVAILABLE = existsSync(FFMPEG) && existsSync(FFPROBE);

const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
const logger = createLogger("electron-main");

// Surface the resolved media binaries at startup.
if (FFMPEG_AVAILABLE) {
	logger.info("Resolved media binaries", {
		platform: process.platform,
		arch: process.arch,
		ffmpeg: FFMPEG,
		ffprobe: FFPROBE,
		source: app.isPackaged ? "bundled (ffmpeg-static)" : "system PATH"
	});
} else {
	logger.error("ffmpeg/ffprobe NOT FOUND — audio transcoding & subtitles will fail", {
		platform: process.platform,
		arch: process.arch,
		ffmpegPath: FFMPEG,
		ffprobePath: FFPROBE,
		source: app.isPackaged ? "bundled (ffmpeg-static)" : "system PATH",
		hint: app.isPackaged
			? "Bundled binary not found — check asarUnpack config"
			: process.platform === "darwin"
				? "Install with: brew install ffmpeg"
				: process.platform === "linux"
					? "Install with your package manager, e.g. sudo apt install ffmpeg"
					: "Install ffmpeg and ensure it is on PATH",
		searchedDirs: app.isPackaged ? [] : SEARCH_DIRS
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
app.commandLine.appendSwitch("enable-experimental-web-platform-features");
app.commandLine.appendSwitch("enable-platform-ac3-eac3-audio");

function assertHttpUrl(raw: unknown): string {
	if (typeof raw !== "string") throw new Error("URL must be a string");

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

	const win = new BrowserWindow({
		width: 1280,
		height: 800,
		autoHideMenuBar: true,
		icon: (() => {
			// .ico = Windows, .icns = macOS, .png = Linux
			const ext = process.platform === "win32" ? "ico" : process.platform === "darwin" ? "icns" : "png";
			const p = path.join(__dirname, `../icon.${ext}`);
			return existsSync(p) ? p : undefined;
		})(),
		webPreferences: {
			preload: path.join(__dirname, "preload.js"),
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
	} else {
		void win.loadFile(path.join(__dirname, "../dist/index.html")).catch((error) => {
			logger.exception("Failed to load bundled app", error);
		});
	}
}

// ── Auto-updater (Squirrel / macOS) ───────────────────────────────────────────
// update-electron-app talks to update.electronjs.org which proxies GitHub
// Releases into a Squirrel-compatible feed. Works only in packaged builds.

function setupAutoUpdater(): void {
	if (!app.isPackaged) return;

	// update.electronjs.org serves the correct Squirrel feed URL for each platform.
	const feedURL = `https://update.electronjs.org/amineflex/openiptv/${process.platform}-${process.arch}/${app.getVersion()}`;

	try {
		autoUpdater.setFeedURL({ url: feedURL });
	} catch (err) {
		logger.error("Auto-updater setFeedURL failed", { error: String(err) });
		return;
	}

	// Forward updater events to the renderer so the UI can react.
	autoUpdater.on("checking-for-update", () => {
		logger.info("Auto-updater: checking for update");
	});

	autoUpdater.on("update-available", () => {
		logger.info("Auto-updater: update available — downloading");
		const win = BrowserWindow.getAllWindows()[0];
		win?.webContents.send("updater:available");
	});

	autoUpdater.on("update-not-available", () => {
		logger.info("Auto-updater: app is up to date");
	});

	autoUpdater.on("update-downloaded", (_event, releaseNotes, releaseName) => {
		logger.info("Auto-updater: update downloaded", { releaseName });
		const win = BrowserWindow.getAllWindows()[0];
		win?.webContents.send("updater:downloaded", { releaseName, releaseNotes });
	});

	autoUpdater.on("error", (err) => {
		logger.error("Auto-updater error", { error: err.message });
	});

	// Check on startup with a small delay to let the window finish loading.
	setTimeout(() => {
		try { autoUpdater.checkForUpdates(); } catch (err) {
			logger.error("Auto-updater checkForUpdates failed", { error: String(err) });
		}
	}, 8000);

	// Then re-check every hour.
	setInterval(() => {
		try { autoUpdater.checkForUpdates(); } catch { /* ignore */ }
	}, 60 * 60 * 1000);
}

// IPC: renderer requests to quit and install the downloaded update.
ipcMain.handle("updater:quit-and-install", () => {
	logger.info("Auto-updater: quit and install requested by renderer");
	autoUpdater.quitAndInstall();
});

app.whenReady()
	.then(() => {
		logger.info("Electron app is ready");
		createWindow();
		setupAutoUpdater();

		app.on("activate", () => {
			if (BrowserWindow.getAllWindows().length === 0) {
				createWindow();
			}
		});
	})
	.catch((error) => {
		logger.exception("Failed to initialize Electron app", error);
		app.quit();
	});

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") {
		app.quit();
	}
});

interface EmbeddedTrack {
	id: string;
	index: number;
	relativeIndex?: number;
	codec: string;
	label: string;
	language: string;
	// Bitmap (image) subtitles can't become WebVTT — they must be burned into
	// the video via ffmpeg overlay. The renderer routes these to that path.
	bitmap: boolean;
}

interface ListResult {
	ok: boolean;
	tracks: EmbeddedTrack[];
	error?: string;
}

interface ExtractResult {
	ok: boolean;
	vtt?: string;
	error?: string;
}

interface ExtractWindowResult extends ExtractResult {
	windowStart?: number;
	windowDuration?: number;
}

interface AudioStreamInfo {
	index: number;
	codec: string;
	language?: string;
	title?: string;
	isDefault?: boolean;
}

interface PlayableStreamResult {
	ok: boolean;
	url: string;
	transcoded: boolean;
	audioCodecs: string[];
	audioTracks?: AudioStreamInfo[];
	transcodeBaseUrl?: string;
	defaultAudioIndex?: number;
	durationSeconds?: number;
	requiresMpegTsPlayer?: boolean;
	error?: string;
}

interface StreamProxyResult {
	ok: boolean;
	id?: string;
	url: string;
	error?: string;
}

interface AppProcessUsage {
	pid: number;
	type: string;
	cpuPercent: number;
	ramMB: number;
}

interface AppUsageStats {
	cpuPercent: number;
	ramMB: number;
	networkKbps: number;
	networkMB: number;
	activeStreams: number;
	gpuProcess?: AppProcessUsage;
	processes: AppProcessUsage[];
}

interface FfmpegSessionStats {
	sourceId: string;
	pid?: number;
	mode: "live" | "vod";
	uptimeSeconds: number;
	startSeconds?: number;
	audioIndex?: number;
	burnSubtitleIndex?: number;
	videoCodec: string;
	audioCodec: string;
	outputKbps: number;
	outputMB: number;
	activeRequests: number;
	cpuPercent?: number;
	ramMB?: number;
}

interface FfmpegServerStats {
	available: boolean;
	serverRunning: boolean;
	port?: number;
	sourceCount: number;
	proxyCount: number;
	activeSessionCount: number;
	activeRequestCount: number;
	totalOutputMB: number;
	sessions: FfmpegSessionStats[];
}

interface AudioProbeStream {
	index: number;
	codec_type?: string;
	codec_name?: string;
	r_frame_rate?: string;
	avg_frame_rate?: string;
	disposition?: {
		default?: number;
	};
	tags?: {
		language?: string;
		title?: string;
	};
}

interface AudioProbeOutput {
	streams?: AudioProbeStream[];
	format?: {
		duration?: string;
		format_name?: string;
	};
}

interface AudioProbeResult {
	streams: AudioProbeStream[];
	durationSeconds?: number;
	videoFps?: string;
	isMpegTs?: boolean;
}

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
interface TranscodeSource {
	url: string;
	videoFps?: string;
	// Live channels need only an audio re-encode (video is copied untouched),
	// and skip the VOD seek/PTS-normalization filtergraph entirely.
	live?: boolean;
}

const transcodeSources = new Map<string, TranscodeSource>();
const streamProxySources = new Map<string, string>();
let transcodeServer: http.Server | null = null;
let transcodeServerPort: number | null = null;

interface MediaUsageCounter {
	bytesTransferred: number;
	activeRequests: number;
	updatedAt: number;
}

const mediaUsageCounters = new Map<string, MediaUsageCounter>();
let lastNetworkSampleAt = Date.now();
let lastNetworkBytes = 0;
const childCpuSamples = new Map<number, { cpuSeconds: number; sampledAt: number }>();

// Every running ffmpeg transcode process. The app only ever plays one video at a
// time, so a process still alive here when a new one starts is stale and leaking.
type TranscodeProcess = ReturnType<typeof spawn>;
const activeTranscodes = new Set<TranscodeProcess>();
const activeTranscodeInfos = new Map<TranscodeProcess, {
	sourceId: string;
	mode: "live" | "vod";
	startedAt: number;
	startSeconds?: number;
	audioIndex?: number;
	burnSubtitleIndex?: number;
	videoCodec: string;
	audioCodec: string;
}>();

let childProcessUsageRequest: Promise<AppProcessUsage[]> | null = null;
let childProcessUsageCache: { pidsKey: string; updatedAt: number; usages: AppProcessUsage[] } = {
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

function getOrCreateMediaCounter(id: string): MediaUsageCounter {
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

function totalMediaBytes(): number {
	let total = 0;
	for (const counter of mediaUsageCounters.values()) {
		total += counter.bytesTransferred;
	}
	return total;
}

function resetNetworkSampling(): void {
	lastNetworkSampleAt = Date.now();
	lastNetworkBytes = totalMediaBytes();
}

function startMediaRequest(id: string): void {
	const counter = getOrCreateMediaCounter(id);
	counter.activeRequests += 1;
	counter.updatedAt = Date.now();
}

function finishMediaRequest(id: string): void {
	const counter = mediaUsageCounters.get(id);
	if (!counter) return;
	counter.activeRequests = Math.max(0, counter.activeRequests - 1);
	counter.updatedAt = Date.now();
}

function recordMediaBytes(id: string, byteCount: number): void {
	const counter = mediaUsageCounters.get(id);
	if (!counter) return;
	counter.bytesTransferred += byteCount;
	counter.updatedAt = Date.now();
}

function deleteMediaCounter(id: string): void {
	mediaUsageCounters.delete(id);
	resetNetworkSampling();
}

function sampleNetworkUsage(): Pick<AppUsageStats, "networkKbps" | "networkMB" | "activeStreams"> {
	const now = Date.now();
	const totalBytes = totalMediaBytes();
	const elapsedSeconds = Math.max(0.001, (now - lastNetworkSampleAt) / 1000);
	const byteDelta = Math.max(0, totalBytes - lastNetworkBytes);

	lastNetworkSampleAt = now;
	lastNetworkBytes = totalBytes;

	let activeStreams = 0;
	for (const counter of mediaUsageCounters.values()) {
		if (counter.activeRequests > 0) activeStreams += 1;
	}

	return {
		networkKbps: Math.round((byteDelta * 8) / 1000 / elapsedSeconds),
		networkMB: Math.round((totalBytes / 1024 / 1024) * 10) / 10,
		activeStreams
	};
}

function runCommand(command: string, args: string[], timeoutMs = 1500): Promise<string> {
	return new Promise((resolve, reject) => {
		const proc = spawn(command, args, { windowsHide: true });
		let stdout = "";
		let stderr = "";

		const timer = setTimeout(() => {
			proc.kill();
			reject(new Error(`${command} timed out`));
		}, timeoutMs);

		proc.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
		proc.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
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

function normalizeWindowsProcessUsage(value: unknown): AppProcessUsage[] {
	const rows = Array.isArray(value) ? value : value ? [value] : [];
	const sampledAt = Date.now();
	const seenPids = new Set<number>();
	const usages = rows
		.map((row) => {
			if (!row || typeof row !== "object") return null;

			const data = row as {
				pid?: unknown;
				type?: unknown;
				cpuSeconds?: unknown;
				ramMB?: unknown;
			};
			const pid = Number(data.pid);
			const cpuSeconds = Number(data.cpuSeconds);
			const ramMB = Number(data.ramMB);
			if (!Number.isInteger(pid)) return null;

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
		.filter((row): row is AppProcessUsage => Boolean(row));

	for (const pid of childCpuSamples.keys()) {
		if (!seenPids.has(pid) && !getActiveTranscodePids().includes(pid)) {
			childCpuSamples.delete(pid);
		}
	}

	return usages;
}

async function queryWindowsProcessUsage(pids: number[]): Promise<AppProcessUsage[]> {
	const pidList = pids.join(",");
	const command = [
		`$ids=@(${pidList})`,
		"$items=@(Get-Process -Id $ids -ErrorAction SilentlyContinue | ForEach-Object { $cpu=0; if ($null -ne $_.CPU) { $cpu=[double]$_.CPU }; [pscustomobject]@{ pid=[int]$_.Id; type=$_.ProcessName; cpuSeconds=$cpu; ramMB=[math]::Round([double]$_.WorkingSet64 / 1MB) } })",
		"if ($items.Count -eq 0) { '[]' } else { $items | ConvertTo-Json -Compress }"
	].join("; ");
	const output = await runCommand("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command]);
	return normalizeWindowsProcessUsage(JSON.parse(output || "[]"));
}

async function queryUnixProcessUsage(pids: number[]): Promise<AppProcessUsage[]> {
	const output = await runCommand("ps", ["-o", "pid=,pcpu=,rss=", "-p", pids.join(",")]);
	return output
		.split(/\r?\n/)
		.map((line) => {
			const [pidRaw, cpuRaw, rssRaw] = line.trim().split(/\s+/);
			const pid = Number(pidRaw);
			if (!Number.isInteger(pid)) return null;
			return {
				pid,
				type: "ffmpeg",
				cpuPercent: Math.round((Number(cpuRaw) || 0) * 10) / 10,
				ramMB: Math.round((Number(rssRaw) || 0) / 1024)
			};
		})
		.filter((row): row is AppProcessUsage => Boolean(row));
}

async function queryChildProcessUsage(pids: number[]): Promise<AppProcessUsage[]> {
	try {
		return process.platform === "win32"
			? await queryWindowsProcessUsage(pids)
			: await queryUnixProcessUsage(pids);
	} catch (error) {
		logger.warn("Failed to query child process usage", {
			error: error instanceof Error ? error.message : String(error),
			pids
		});
		return [];
	}
}

function getActiveTranscodePids(): number[] {
	return [...activeTranscodes]
		.map((proc) => proc.pid)
		.filter((pid): pid is number => typeof pid === "number" && Number.isInteger(pid));
}

async function getChildProcessUsages(): Promise<AppProcessUsage[]> {
	const pids = getActiveTranscodePids().sort((a, b) => a - b);
	const pidsKey = pids.join(",");
	if (!pidsKey) {
		childProcessUsageCache = { pidsKey: "", updatedAt: Date.now(), usages: [] };
		childCpuSamples.clear();
		return [];
	}

	const now = Date.now();
	if (
		childProcessUsageCache.pidsKey === pidsKey
		&& now - childProcessUsageCache.updatedAt < 750
	) {
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

function createForwardHeaders(headers: IncomingHttpHeaders, remoteUrl: URL): IncomingHttpHeaders {
	const forwarded: IncomingHttpHeaders = {};
	for (const [name, value] of Object.entries(headers)) {
		const lowerName = name.toLowerCase();
		if (HOP_BY_HOP_HEADERS.has(lowerName) || lowerName === "host") continue;
		if (value === undefined) continue;
		forwarded[name] = value;
	}
	forwarded.host = remoteUrl.host;
	return forwarded;
}

function createResponseHeaders(headers: IncomingHttpHeaders): Record<string, string | string[]> {
	const responseHeaders: Record<string, string | string[]> = {
		"Access-Control-Allow-Origin": "*",
		"Access-Control-Expose-Headers": "Accept-Ranges, Content-Length, Content-Range, Content-Type",
		"Cache-Control": "no-store"
	};

	for (const [name, value] of Object.entries(headers)) {
		const lowerName = name.toLowerCase();
		if (HOP_BY_HOP_HEADERS.has(lowerName) || value === undefined) continue;
		responseHeaders[name] = Array.isArray(value) ? value : String(value);
	}

	return responseHeaders;
}

function handleStreamProxyRequest(
	request: http.IncomingMessage,
	response: ServerResponse,
	requestUrl: URL
): void {
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
	let proxyRequest: http.ClientRequest | null = null;

	const finish = () => {
		if (finished) return;
		finished = true;
		finishMediaRequest(match[1]);
	};

	startMediaRequest(match[1]);

	const openRemoteStream = (remoteSourceUrl: string, redirectCount = 0) => {
		if (finished) return;

		const remoteUrl = new URL(remoteSourceUrl);
		const transport = remoteUrl.protocol === "https:" ? https : http;
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

			if (
				redirectLocation
				&& [301, 302, 303, 307, 308].includes(statusCode)
				&& redirectCount < 5
			) {
				proxyResponse.resume();
				openRemoteStream(new URL(redirectLocation, remoteUrl).toString(), redirectCount + 1);
				return;
			}

			response.writeHead(statusCode, proxyResponse.statusMessage, createResponseHeaders(proxyResponse.headers));

			proxyResponse.on("data", (chunk: Buffer) => {
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
			if (!response.headersSent) response.writeHead(502);
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

function killTranscode(proc: TranscodeProcess): void {
	activeTranscodes.delete(proc);
	activeTranscodeInfos.delete(proc);

	// Already exited — nothing to do.
	if (proc.exitCode !== null || proc.signalCode !== null) return;

	try {
		proc.stdout?.unpipe();
		proc.stdout?.destroy();
		proc.kill(); // SIGTERM (immediate TerminateProcess on Windows)
	} catch (error) {
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
			} catch {
				/* process is already gone */
			}
		}
	}, 1500);
	forceTimer.unref();
}

function killAllTranscodes(): void {
	for (const proc of [...activeTranscodes]) {
		killTranscode(proc);
	}
}

function parseDurationSeconds(value: string | undefined): number | undefined {
	if (!value) return undefined;

	const duration = Number(value);
	return Number.isFinite(duration) && duration > 0 ? duration : undefined;
}

function parseFrameRate(value: string | undefined): string | undefined {
	if (!value || value === "0/0") return undefined;

	const [rawNum, rawDen] = value.split("/");
	const numerator = Number(rawNum);
	const denominator = Number(rawDen ?? 1);
	if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || numerator <= 0 || denominator <= 0) {
		return undefined;
	}

	const fps = numerator / denominator;
	if (fps < 1 || fps > 120) return undefined;
	return `${Math.round(numerator)}/${Math.round(denominator)}`;
}

function formatVttTime(value: number): string {
	const totalMilliseconds = Math.max(0, Math.round(value * 1000));
	const hours = Math.floor(totalMilliseconds / 3_600_000);
	const minutes = Math.floor((totalMilliseconds % 3_600_000) / 60_000);
	const seconds = Math.floor((totalMilliseconds % 60_000) / 1000);
	const milliseconds = totalMilliseconds % 1000;
	return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(milliseconds).padStart(3, "0")}`;
}

function decodeFfprobePacketData(data: string | undefined): string {
	if (!data) return "";

	const bytes: number[] = [];
	for (const line of data.split(/\r?\n/)) {
		const match = line.match(/^\s*[0-9a-fA-F]{8}:\s+(.+?)(?:\s{2,}|$)/);
		if (!match) continue;

		const hex = match[1].replace(/\s+/g, "");
		for (let index = 0; index + 1 < hex.length; index += 2) {
			const byte = Number.parseInt(hex.slice(index, index + 2), 16);
			if (Number.isFinite(byte)) bytes.push(byte);
		}
	}

	return Buffer.from(bytes).toString("utf8").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
}

function packetsToVtt(packets: Array<{ pts_time?: string; duration_time?: string; data?: string }>): string {
	const decodedPackets = packets
		.map((packet) => {
			const start = Number(packet.pts_time);
			const duration = Number(packet.duration_time);
			const text = decodeFfprobePacketData(packet.data);
			if (!Number.isFinite(start) || !text) return null;

			return {
				start,
				duration: Number.isFinite(duration) && duration > 0 ? duration : null,
				text
			};
		})
		.filter((packet): packet is { start: number; duration: number | null; text: string } => Boolean(packet))
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

function probeAudioStreams(url: string, timeoutMs?: number): Promise<AudioProbeResult> {
	return new Promise((resolve, reject) => {
		const proc = spawn(FFPROBE, [
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
		const killTimer = timeoutMs ? setTimeout(() => { if (!proc.killed) proc.kill(); }, timeoutMs) : null;
		proc.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
		proc.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });

		proc.on("close", (code) => {
			if (killTimer) clearTimeout(killTimer);
			if (code !== 0) {
				reject(new Error(stderr.trim() || `ffprobe exited with code ${code ?? "unknown"}`));
				return;
			}

			try {
				const parsed = JSON.parse(stdout) as AudioProbeOutput;
				const streams = parsed.streams ?? [];
				const videoStream = streams.find((stream) => stream.codec_type === "video");
				const fmtName = parsed.format?.format_name ?? "";
				resolve({
					streams: streams.filter((stream) => stream.codec_type === "audio"),
					durationSeconds: parseDurationSeconds(parsed.format?.duration),
					videoFps: parseFrameRate(videoStream?.avg_frame_rate) ?? parseFrameRate(videoStream?.r_frame_rate),
					isMpegTs: fmtName.split(",").some((f) => f.trim() === "mpegts")
				});
			} catch (error) {
				logger.exception("Failed to parse audio probe output", error, {
					stderr,
					url
				});
				reject(new Error("Failed to read audio streams"));
			}
		});
		proc.on("error", (error) => {
			if (killTimer) clearTimeout(killTimer);
			logger.exception("Failed to run ffprobe for audio streams", error, {
				url
			});
			reject(error);
		});
	});
}

function shouldTranscodeAudio(streams: AudioProbeStream[]): boolean {
	if (streams.length === 0) return false;

	const defaultStream = streams.find((stream) => stream.disposition?.default === 1) ?? streams[0];
	const codec = (defaultStream.codec_name ?? "").toLowerCase();
	return UNSUPPORTED_BROWSER_AUDIO_CODECS.has(codec);
}

function ensureTranscodeServer(): Promise<number> {
	if (transcodeServerPort) return Promise.resolve(transcodeServerPort);

	return new Promise((resolve, reject) => {
		const server = http.createServer((request, response) => {
			const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host ?? "127.0.0.1"}`);
			if (requestUrl.pathname.startsWith("/stream/")) {
				handleStreamProxyRequest(request, response, requestUrl);
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
				if (mediaRequestFinished) return;
				mediaRequestFinished = true;
				finishMediaRequest(match[1]);
			};

			let args: string[];
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
			} else {
				// Normalize the video timeline to a clean CFR-ish PTS so mpegts.js and
				// the seek/resume bookkeeping behave. When burning a bitmap subtitle,
				// overlay it first (using the source's native, mutually-consistent
				// timestamps so it stays in sync) and normalize the combined result;
				// eof_action=pass lets the video continue once the subtitle stream ends.
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
					"-hide_banner",
					"-loglevel", "error",
					"-fflags", "+genpts",
					...(startTime > 0 ? ["-ss", startTime.toFixed(3)] : []),
					"-i", sourceUrl,
					...videoArgs,
					"-map", `0:a:${audioIndex}?`,
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
			}
			const proc = spawn(FFMPEG, args);
			activeTranscodes.add(proc);
			activeTranscodeInfos.set(proc, {
				sourceId: match[1],
				mode: transcodeSource.live ? "live" : "vod",
				startedAt: Date.now(),
				startSeconds: transcodeSource.live ? undefined : startTime,
				audioIndex: transcodeSource.live ? undefined : audioIndex,
				burnSubtitleIndex: burnSubtitleIndex ?? undefined,
				videoCodec: transcodeSource.live ? "copy" : "libx264",
				audioCodec: "aac"
			});

			// Drain stderr: if nobody reads it, a full OS pipe buffer makes ffmpeg
			// block mid-write and freeze, which then ignores the dead stdout pipe.
			proc.stderr.on("data", () => { /* discarded — loglevel is "error" */ });

			proc.stdout.on("data", (chunk: Buffer) => {
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

async function createTranscodedAudioUrl(sourceUrl: string, videoFps?: string): Promise<string> {
	const port = await ensureTranscodeServer();
	const id = randomUUID();
	transcodeSources.set(id, { url: sourceUrl, videoFps });
	getOrCreateMediaCounter(id);
	logger.debug("Created local transcode source", {
		sourceId: id,
		sourceUrl,
		videoFps
	});
	return `http://127.0.0.1:${port}/transcode/${id}`;
}

async function createLiveTranscodeUrl(sourceUrl: string): Promise<string> {
	const port = await ensureTranscodeServer();
	const id = randomUUID();
	transcodeSources.set(id, { url: sourceUrl, live: true });
	getOrCreateMediaCounter(id);
	logger.debug("Created live transcode source", {
		sourceId: id,
		sourceUrl
	});
	return `http://127.0.0.1:${port}/transcode/${id}`;
}

async function createStreamProxyUrl(sourceUrl: string): Promise<{ id: string; url: string }> {
	const port = await ensureTranscodeServer();
	const id = randomUUID();
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

ipcMain.handle("media:create-stream-proxy", async (_event, rawUrl: unknown): Promise<StreamProxyResult> => {
	let url: string;
	try {
		url = assertHttpUrl(rawUrl);
	} catch (error) {
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
	} catch (error) {
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

ipcMain.handle("media:release-stream-proxy", (_event, rawId: unknown) => {
	if (typeof rawId !== "string") return { ok: false };
	streamProxySources.delete(rawId);
	deleteMediaCounter(rawId);
	return { ok: true };
});

ipcMain.handle("subtitle:list-embedded", async (_event, rawUrl: unknown): Promise<ListResult> => {
	let url: string;
	try {
		url = assertHttpUrl(rawUrl);
	} catch (error) {
		logger.warn("Rejected embedded subtitle list request", {
			error: error instanceof Error ? error.message : "Invalid URL"
		});
		return { ok: false, tracks: [], error: error instanceof Error ? error.message : "Invalid URL" };
	}

	return new Promise<ListResult>((resolve) => {
		const proc = spawn(FFPROBE, [
			"-v", "quiet",
			"-print_format", "json",
			"-show_streams",
			"-select_streams", "s",
			url
		]);

		let stdout = "";
		let stderr = "";
		proc.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
		proc.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });

		proc.on("close", () => {
			try {
				if (stdout.trim().length === 0) {
					// ffprobe produced nothing (missing binary, unreachable URL…).
					resolve({ ok: false, tracks: [], error: stderr.trim() || "No probe output" });
					return;
				}
				interface FfprobeStream {
					index: number;
					codec_name?: string;
					tags?: { language?: string; title?: string };
				}
				interface FfprobeOutput {
					streams?: FfprobeStream[];
				}
				const parsed = JSON.parse(stdout) as FfprobeOutput;
				const streams = parsed.streams ?? [];

				const tracks: EmbeddedTrack[] = streams
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
			} catch (error) {
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

ipcMain.handle(
	"subtitle:extract-embedded-window",
	async (
		_event,
		rawUrl: unknown,
		index: unknown,
		relativeIndex: unknown,
		startSeconds: unknown,
		durationSeconds: unknown
	): Promise<ExtractWindowResult> => {
		let url: string;
		try {
			url = assertHttpUrl(rawUrl);
		} catch (error) {
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

		return new Promise<ExtractWindowResult>((resolve) => {
			const proc = spawn(FFPROBE, [
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
			proc.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
			proc.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });

			const killTimer = setTimeout(() => {
				if (!proc.killed) proc.kill();
			}, 20000);

			proc.on("close", () => {
				clearTimeout(killTimer);
				try {
					const parsed = JSON.parse(stdout || "{}") as {
						packets?: Array<{ pts_time?: string; duration_time?: string; data?: string }>;
					};
					resolve({
						ok: true,
						vtt: packetsToVtt(parsed.packets ?? []),
						windowStart,
						windowDuration
					});
				} catch (error) {
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
	}
);

ipcMain.handle("subtitle:extract-embedded", async (_event, rawUrl: unknown, index: unknown): Promise<ExtractResult> => {
	let url: string;
	try {
		url = assertHttpUrl(rawUrl);
	} catch (error) {
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

	return new Promise<ExtractResult>((resolve) => {
		const proc = spawn(FFMPEG, [
			"-hide_banner",
			"-loglevel", "error",
			"-i", url,
			"-map", `0:${streamIndex}`,
			"-f", "webvtt",
			"pipe:1"
		]);

		let output = "";
		let stderr = "";
		proc.stdout.on("data", (chunk: Buffer) => { output += chunk.toString(); });
		proc.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });

		proc.on("close", (code) => {
			if (code === 0 && output.trim().length > 0) {
				resolve({ ok: true, vtt: output });
			} else {
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

ipcMain.handle("media:resolve-playable-stream", async (_event, rawUrl: unknown): Promise<PlayableStreamResult> => {
	let url: string;
	try {
		url = assertHttpUrl(rawUrl);
	} catch (error) {
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

		const audioTracks: AudioStreamInfo[] = audioStreams.map((stream) => ({
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
			const transcodeBaseUrl = await createTranscodedAudioUrl(url, probeResult.videoFps);
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
	} catch (error) {
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

interface LiveStreamResolveResult {
	ok: boolean;
	url: string;
	transcoded: boolean;
	error?: string;
}

ipcMain.handle("media:resolve-live-stream", async (_event, rawUrl: unknown): Promise<LiveStreamResolveResult> => {
	let url: string;
	try {
		url = assertHttpUrl(rawUrl);
	} catch (error) {
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
	} catch (error) {
		// Probe failed (unreachable/slow upstream) — fall back to direct playback so
		// AAC channels still work even when we couldn't inspect the codec.
		logger.warn("Live stream audio probe failed; using direct playback", {
			error: error instanceof Error ? error.message : String(error),
			url
		});
		return { ok: true, url, transcoded: false };
	}
});

interface ProbeInfoResult {
	ok: boolean;
	streams?: unknown[];
	format?: unknown;
	error?: string;
}

ipcMain.handle("media:probe-stream-info", (_event, rawUrl: unknown): Promise<ProbeInfoResult> => {
	let url: string;
	try {
		url = assertHttpUrl(rawUrl);
	} catch (error) {
		return Promise.resolve({ ok: false, error: error instanceof Error ? error.message : "Invalid URL" });
	}

	return new Promise((resolve) => {
		const proc = spawn(FFPROBE, [
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
		proc.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
		proc.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });

		const killTimer = setTimeout(() => { if (!proc.killed) proc.kill(); }, 10000);

		proc.on("close", (code) => {
			clearTimeout(killTimer);
			if (code === 0 && stdout.trim()) {
				try {
					const parsed = JSON.parse(stdout) as { streams?: unknown[]; format?: unknown };
					resolve({ ok: true, streams: parsed.streams ?? [], format: parsed.format });
				} catch {
					resolve({ ok: false, error: "Failed to parse probe output" });
				}
			} else {
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
ipcMain.handle("media:stop-transcoding", () => {
	killAllTranscodes();
	for (const id of transcodeSources.keys()) {
		deleteMediaCounter(id);
	}
	transcodeSources.clear();
	return { ok: true };
});

async function getAppUsageStats(): Promise<AppUsageStats> {
	// app.getAppMetrics() returns per-process stats (main, renderer, GPU…)
	// percentCPUUsage is measured since the previous call, so the polling
	// interval on the renderer side drives the measurement window.
	const metrics = app.getAppMetrics();
	let cpuPercent = 0;
	let ramMB = 0;
	const processes: AppProcessUsage[] = [];
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

async function getFfmpegServerStats(): Promise<FfmpegServerStats> {
	const now = Date.now();
	const childProcesses = await getChildProcessUsages();
	const childProcessByPid = new Map(childProcesses.map((usage) => [usage.pid, usage]));
	const sessions: FfmpegSessionStats[] = [];

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
		if (!counter) continue;
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

ipcMain.handle("stats:get-app-usage", () => getAppUsageStats());
ipcMain.handle("stats:get-system", () => getAppUsageStats());
ipcMain.handle("stats:get-ffmpeg", () => getFfmpegServerStats());

app.on("before-quit", () => {
	logger.info("Electron app is quitting");
	killAllTranscodes();
	streamProxySources.clear();
	transcodeSources.clear();
	mediaUsageCounters.clear();
	transcodeServer?.close();
	transcodeServer = null;
	transcodeServerPort = null;
});
