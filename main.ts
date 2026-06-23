import { app, BrowserWindow, ipcMain } from "electron";
import path from "path";
import { spawn } from "child_process";

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

// Only text-based subtitle codecs can be converted to WebVTT.
// Bitmap subtitles (hdmv_pgs_subtitle, dvd_subtitle, dvb_subtitle...) cannot.
const TEXT_SUBTITLE_CODECS = new Set([
	"subrip", "srt", "ass", "ssa", "mov_text", "webvtt", "vtt", "text", "microdvd", "micro_dvd"
]);

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
