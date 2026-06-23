import { app, BrowserWindow, ipcMain } from "electron";
import path from "path";
import { spawn } from "child_process";
import http from "http";
import { randomUUID } from "crypto";

const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];

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
	const win = new BrowserWindow({
		width: 1280,
		height: 800,
		autoHideMenuBar: true,
		webPreferences: {
			preload: path.join(__dirname, "preload.js"),
			contextIsolation: true,
			nodeIntegration: false,
			experimentalFeatures: true,
			enableBlinkFeatures: "AudioVideoTracks"
		}
	});

	if (VITE_DEV_SERVER_URL) {
		void win.loadURL(VITE_DEV_SERVER_URL);
		win.webContents.openDevTools();
	} else {
		void win.loadFile(path.join(__dirname, "../dist/index.html"));
	}
}

app.whenReady().then(() => {
	createWindow();

	app.on("activate", () => {
		if (BrowserWindow.getAllWindows().length === 0) {
			createWindow();
		}
	});
});

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") {
		app.quit();
	}
});

interface EmbeddedTrack {
	id: string;
	index: number;
	codec: string;
	label: string;
	language: string;
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

interface PlayableStreamResult {
	ok: boolean;
	url: string;
	transcoded: boolean;
	audioCodecs: string[];
	durationSeconds?: number;
	error?: string;
}

interface AudioProbeStream {
	index: number;
	codec_name?: string;
	disposition?: {
		default?: number;
	};
}

interface AudioProbeOutput {
	streams?: AudioProbeStream[];
	format?: {
		duration?: string;
	};
}

interface AudioProbeResult {
	streams: AudioProbeStream[];
	durationSeconds?: number;
}

// Only text-based subtitle codecs can be converted to WebVTT.
// Bitmap subtitles (hdmv_pgs_subtitle, dvd_subtitle, dvb_subtitle...) cannot.
const TEXT_SUBTITLE_CODECS = new Set([
	"subrip", "srt", "ass", "ssa", "mov_text", "webvtt", "vtt", "text", "microdvd", "micro_dvd"
]);

const UNSUPPORTED_BROWSER_AUDIO_CODECS = new Set(["ac3", "eac3", "truehd", "dts", "dts_hd"]);
const transcodeSources = new Map<string, string>();
let transcodeServer: http.Server | null = null;
let transcodeServerPort: number | null = null;

function parseDurationSeconds(value: string | undefined): number | undefined {
	if (!value) return undefined;

	const duration = Number(value);
	return Number.isFinite(duration) && duration > 0 ? duration : undefined;
}

function probeAudioStreams(url: string): Promise<AudioProbeResult> {
	return new Promise((resolve, reject) => {
		const proc = spawn("ffprobe", [
			"-v", "quiet",
			"-print_format", "json",
			"-show_streams",
			"-show_format",
			"-select_streams", "a",
			url
		]);

		let stdout = "";
		let stderr = "";
		proc.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
		proc.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });

		proc.on("close", (code) => {
			if (code !== 0) {
				reject(new Error(stderr.trim() || `ffprobe exited with code ${code ?? "unknown"}`));
				return;
			}

			try {
				const parsed = JSON.parse(stdout) as AudioProbeOutput;
				resolve({
					streams: parsed.streams ?? [],
					durationSeconds: parseDurationSeconds(parsed.format?.duration)
				});
			} catch {
				reject(new Error("Failed to read audio streams"));
			}
		});
		proc.on("error", reject);
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
			const match = requestUrl.pathname.match(/^\/transcode\/([^/]+)$/);
			const startTime = Math.max(0, Number(requestUrl.searchParams.get("start") ?? 0) || 0);

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

			const args = [
				"-hide_banner",
				"-loglevel", "error",
				"-fflags", "+genpts",
				...(startTime > 0 ? ["-ss", startTime.toFixed(3)] : []),
				"-i", sourceUrl,
				"-map", "0:v:0?",
				"-map", "0:a:0?",
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
			const proc = spawn("ffmpeg", args);

			proc.stdout.pipe(response);
			request.on("close", () => {
				if (!proc.killed) proc.kill("SIGKILL");
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

async function createTranscodedAudioUrl(sourceUrl: string): Promise<string> {
	const port = await ensureTranscodeServer();
	const id = randomUUID();
	transcodeSources.set(id, sourceUrl);
	return `http://127.0.0.1:${port}/transcode/${id}`;
}

ipcMain.handle("subtitle:list-embedded", async (_event, rawUrl: unknown): Promise<ListResult> => {
	let url: string;
	try {
		url = assertHttpUrl(rawUrl);
	} catch (error) {
		return { ok: false, tracks: [], error: error instanceof Error ? error.message : "Invalid URL" };
	}

	return new Promise<ListResult>((resolve) => {
		const proc = spawn("ffprobe", [
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
			} catch {
				resolve({ ok: false, tracks: [], error: stderr.trim() || "Failed to read subtitle streams" });
			}
		});
		proc.on("error", (error) => resolve({ ok: false, tracks: [], error: error.message }));
	});
});

ipcMain.handle("subtitle:extract-embedded", async (_event, rawUrl: unknown, index: unknown): Promise<ExtractResult> => {
	let url: string;
	try {
		url = assertHttpUrl(rawUrl);
	} catch (error) {
		return { ok: false, error: error instanceof Error ? error.message : "Invalid URL" };
	}

	const streamIndex = Number(index);
	if (!Number.isInteger(streamIndex) || streamIndex < 0) {
		return { ok: false, error: "Invalid stream index" };
	}

	return new Promise<ExtractResult>((resolve) => {
		const proc = spawn("ffmpeg", [
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
				resolve({ ok: false, error: stderr.trim() || `ffmpeg exited with code ${code ?? "unknown"}` });
			}
		});
		proc.on("error", (error) => resolve({ ok: false, error: error.message }));
	});
});

ipcMain.handle("media:resolve-playable-stream", async (_event, rawUrl: unknown): Promise<PlayableStreamResult> => {
	let url: string;
	try {
		url = assertHttpUrl(rawUrl);
	} catch (error) {
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
	} catch (error) {
		return {
			ok: false,
			url,
			transcoded: false,
			audioCodecs: [],
			error: error instanceof Error ? error.message : "Failed to inspect audio streams"
		};
	}
});

app.on("before-quit", () => {
	transcodeServer?.close();
	transcodeServer = null;
	transcodeServerPort = null;
});
