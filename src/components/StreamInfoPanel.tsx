import { useEffect, useState } from "react";
import type { RefObject } from "react";
import { InformationCircleIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { Dialog, DialogPanel, DialogTitle } from "@headlessui/react";
import type {
	AppUsageStats,
	FfmpegServerStats,
	FfmpegSessionStats,
	StreamInfoResult,
	StreamProbeStream
} from "../types";

interface VideoStats {
	bufferSec: number;
	decodedFrames: number;
	droppedFrames: number;
}

interface Props {
	open: boolean;
	streamUrl: string | null;
	onClose: () => void;
	videoRef?: RefObject<HTMLVideoElement | null>;
}

// ── Formatting helpers ────────────────────────────────────────────────────────

function parseFps(avg?: string, r?: string): string {
	const raw = avg && avg !== "0/0" ? avg : r;
	if (!raw) return "";
	const [num, den] = raw.split("/").map(Number);
	if (!den || !num) return "";
	const fps = num / den;
	const known: [number, string][] = [
		[23.976, "23.976"], [24, "24"], [25, "25"],
		[29.97, "29.97"], [30, "30"], [50, "50"],
		[59.94, "59.94"], [60, "60"]
	];
	for (const [val, label] of known) {
		if (Math.abs(fps - val) < 0.05) return `${label} fps`;
	}
	return `${fps.toFixed(3).replace(/\.?0+$/, "")} fps`;
}

function formatBitrate(bps?: string): string {
	const n = Number(bps ?? 0);
	if (!n) return "";
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2).replace(/\.?0+$/, "")} Mbps`;
	if (n >= 1_000) return `${Math.round(n / 1_000)} Kbps`;
	return `${n} bps`;
}

function formatDuration(s?: string): string {
	const n = Number(s ?? 0);
	if (!n || n <= 0) return "";
	const h = Math.floor(n / 3600);
	const m = Math.floor((n % 3600) / 60);
	const sec = Math.floor(n % 60);
	if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
	return `${m}:${String(sec).padStart(2, "0")}`;
}

function formatContainer(name?: string): string {
	if (!name) return "—";
	const map: Record<string, string> = {
		hls: "HLS",
		mpegts: "MPEG-TS",
		"matroska,webm": "MKV / WebM",
		matroska: "MKV",
		"mov,mp4,m4a,3gp,3g2,mj2": "MP4",
		mp4: "MP4",
		avi: "AVI",
		flv: "FLV",
		rtmp: "RTMP",
		ogg: "OGG",
		webm: "WebM",
	};
	return map[name] ?? name.toUpperCase().replace(/,/g, " / ");
}

function formatChannels(ch?: number, layout?: string): string {
	if (layout) return layout.replace("stereo", "Stereo").replace("mono", "Mono");
	if (!ch) return "";
	if (ch === 1) return "Mono";
	if (ch === 2) return "Stereo";
	return `${ch} ch`;
}

function formatArch(arch: string): string {
	const map: Record<string, string> = {
		x64: "x86-64", arm64: "ARM64", ia32: "x86", arm: "ARM", riscv64: "RISC-V 64"
	};
	return map[arch] ?? arch;
}

function formatPlatform(platform: string): string {
	const map: Record<string, string> = { win32: "Windows", darwin: "macOS", linux: "Linux" };
	return map[platform] ?? platform;
}

function formatMB(mb: number): string {
	if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
	return `${mb} MB`;
}

function formatKbps(kbps: number): string {
	if (kbps >= 1000) return `${(kbps / 1000).toFixed(1)} Mbps`;
	return `${Math.round(kbps)} Kbps`;
}

function formatElapsed(seconds: number): string {
	if (!Number.isFinite(seconds) || seconds <= 0) return "0s";
	const total = Math.floor(seconds);
	const h = Math.floor(total / 3600);
	const m = Math.floor((total % 3600) / 60);
	const s = total % 60;
	if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
	if (m > 0) return `${m}m ${String(s).padStart(2, "0")}s`;
	return `${s}s`;
}

function formatCount(count: number, singular: string, plural = `${singular}s`): string {
	return `${count} ${count === 1 ? singular : plural}`;
}

function barColor(percent: number): string {
	if (percent >= 80) return "bg-red-500";
	if (percent >= 60) return "bg-amber-400";
	return "bg-secondary-400";
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Row({ label, value }: { label: string; value?: string }) {
	if (!value) return null;
	return (
		<div className="flex items-baseline justify-between gap-6 py-0.5">
			<span className="shrink-0 text-xs text-gray-500">{label}</span>
			<span className="text-right text-sm font-semibold text-white">{value}</span>
		</div>
	);
}

function SectionTitle({ children }: { children: React.ReactNode }) {
	return (
		<h3 className="mb-2.5 text-[10px] font-bold uppercase tracking-widest text-secondary-700">
			{children}
		</h3>
	);
}

function UsageBar({ percent, color }: { percent: number; color: string }) {
	return (
		<div className="h-1.5 rounded-full bg-white/10">
			<div
				className={`h-full rounded-full transition-all duration-700 ${color}`}
				style={{ width: `${Math.min(100, percent)}%` }}
			/>
		</div>
	);
}

function VideoSection({ s }: { s: StreamProbeStream }) {
	return (
		<section className="px-5 py-4">
			<SectionTitle>Video</SectionTitle>
			<Row label="Codec" value={[s.codec_name?.toUpperCase(), s.profile && `${s.profile}`].filter(Boolean).join(" · ")} />
			{s.width && s.height && <Row label="Resolution" value={`${s.width} × ${s.height}`} />}
			<Row label="Frame rate" value={parseFps(s.avg_frame_rate, s.r_frame_rate)} />
			<Row label="Pixel format" value={s.pix_fmt ?? undefined} />
			<Row label="Bitrate" value={formatBitrate(s.bit_rate)} />
		</section>
	);
}

function AudioTrackCard({ s }: { s: StreamProbeStream }) {
	const lang = s.tags?.language;
	const title = s.tags?.title;
	return (
		<div className="rounded-xl bg-primary/10 px-3.5 py-3">
			{(lang || title) && (
				<div className="mb-2 flex items-center gap-2">
					{lang && (
						<span className="rounded-full bg-secondary-400/15 px-2 py-0.5 text-xs font-black text-secondary-400">
							{lang.toUpperCase()}
						</span>
					)}
					{title && <span className="text-xs text-gray-400">{title}</span>}
				</div>
			)}
			<Row label="Codec" value={s.codec_name?.toUpperCase()} />
			<Row label="Layout" value={formatChannels(s.channels, s.channel_layout)} />
			{s.sample_rate && <Row label="Sample rate" value={`${s.sample_rate} Hz`} />}
			<Row label="Bitrate" value={formatBitrate(s.bit_rate)} />
		</div>
	);
}

function SubtitleRow({ s }: { s: StreamProbeStream }) {
	const lang = s.tags?.language;
	const title = s.tags?.title;
	return (
		<div className="flex items-center gap-2.5 py-1">
			{lang && (
				<span className="shrink-0 rounded-full bg-secondary-400/15 px-2 py-0.5 text-xs font-black text-secondary-400">
					{lang.toUpperCase()}
				</span>
			)}
			<span className="text-sm text-secondary-800">{s.codec_name?.toUpperCase()}</span>
			{title && <span className="truncate text-sm text-gray-500">— {title}</span>}
		</div>
	);
}

// ── Main component ────────────────────────────────────────────────────────────

function FfmpegSessionCard({ session }: { session: FfmpegSessionStats }) {
	const modeLabel = session.mode === "live" ? "Live audio transcode" : "VOD transcode";
	const processValue = session.cpuPercent !== undefined && session.ramMB !== undefined
		? `${session.cpuPercent}% / ${formatMB(session.ramMB)}`
		: undefined;
	const outputValue = `${formatKbps(session.outputKbps)} avg / ${formatMB(session.outputMB)}`;

	return (
		<div className="rounded-xl bg-primary/10 px-3.5 py-3">
			<div className="mb-2 flex items-center justify-between gap-3">
				<span className="text-sm font-bold text-white">{modeLabel}</span>
				{session.activeRequests > 0 && (
					<span className="rounded-full bg-green-400/15 px-2 py-0.5 text-[10px] font-black uppercase text-green-300">
						Active
					</span>
				)}
			</div>
			<Row label="PID" value={session.pid ? String(session.pid) : undefined} />
			<Row label="Runtime" value={formatElapsed(session.uptimeSeconds)} />
			<Row label="Process" value={processValue} />
			<Row label="Output" value={outputValue} />
			<Row label="Codecs" value={`${session.videoCodec.toUpperCase()} / ${session.audioCodec.toUpperCase()}`} />
			{session.startSeconds !== undefined && session.startSeconds > 0 && (
				<Row label="Offset" value={formatElapsed(session.startSeconds)} />
			)}
			{session.audioIndex !== undefined && (
				<Row label="Audio track" value={String(session.audioIndex + 1)} />
			)}
			{session.burnSubtitleIndex !== undefined && (
				<Row label="Burned subtitle" value={`Track ${session.burnSubtitleIndex + 1}`} />
			)}
		</div>
	);
}

function FfmpegServerSection({ stats }: { stats: FfmpegServerStats }) {
	const sourceSummary = [
		formatCount(stats.sourceCount, "source"),
		formatCount(stats.proxyCount, "proxy", "proxies")
	].join(" / ");
	const status = stats.activeSessionCount > 0 ? "Decoding" : "Ready";

	return (
		<section className="border-b border-white/[0.07] px-5 py-4">
			<SectionTitle>
				<span className="flex items-center gap-2">
					FFmpeg Decode Server
					{stats.activeSessionCount > 0 && (
						<span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-green-400" />
					)}
				</span>
			</SectionTitle>

			<div className="space-y-3">
				<div>
					<Row label="Status" value={status} />
					<Row label="Endpoint" value={stats.port ? `127.0.0.1:${stats.port}` : undefined} />
					<Row label="FFmpeg" value={stats.available ? "Available" : "Missing"} />
					<Row label="Sources" value={sourceSummary} />
					<Row label="Requests" value={String(stats.activeRequestCount)} />
					<Row label="Output" value={formatMB(stats.totalOutputMB)} />
				</div>

				{stats.sessions.length > 0 ? (
					<div className="space-y-2">
						{stats.sessions.map((session) => (
							<FfmpegSessionCard key={`${session.sourceId}:${session.pid ?? "pending"}`} session={session} />
						))}
					</div>
				) : (
					<p className="rounded-xl bg-primary/10 px-3.5 py-3 text-xs text-gray-500">
						No active FFmpeg process
					</p>
				)}
			</div>
		</section>
	);
}

export default function StreamInfoPanel({ open, streamUrl, onClose, videoRef }: Props) {
	const [info, setInfo] = useState<StreamInfoResult | null>(null);
	const [loading, setLoading] = useState(false);
	const [appStats, setAppStats] = useState<AppUsageStats | null>(null);
	const [ffmpegStats, setFfmpegStats] = useState<FfmpegServerStats | null>(null);
	const [videoStats, setVideoStats] = useState<VideoStats | null>(null);

	// Probe stream info (static, once per open+url)
	useEffect(() => {
		if (!open || !streamUrl) return;
		let cancelled = false;
		setLoading(true);
		setInfo(null);

		// If the preload bridge failed to load, surface it instead of spinning forever.
		const probe = window.openIptv?.probeStreamInfo;
		if (!probe) {
			setInfo({ ok: false, error: "Bridge unavailable (preload not loaded)" });
			setLoading(false);
			return;
		}

		probe(streamUrl)
			.then((result) => { if (!cancelled) { setInfo(result); setLoading(false); } })
			.catch(() => { if (!cancelled) { setInfo({ ok: false, error: "Failed to probe stream" }); setLoading(false); } });

		return () => { cancelled = true; };
	}, [open, streamUrl]);

	// Poll live stats every second while panel is open
	useEffect(() => {
		if (!open) {
			setAppStats(null);
			setFfmpegStats(null);
			setVideoStats(null);
			return;
		}

		let active = true;

		const tick = async () => {
			const usageRequest = (
				window.openIptv?.getAppUsageStats?.()
				?? window.openIptv?.getSystemStats?.()
				?? Promise.resolve(null)
			);
			const ffmpegRequest = window.openIptv?.getFfmpegStats?.() ?? Promise.resolve(null);
			const [usage, ffmpeg] = await Promise.all([
				usageRequest.catch(() => null),
				ffmpegRequest.catch(() => null)
			]);
			if (active && usage) setAppStats(usage);
			if (active && ffmpeg) setFfmpegStats(ffmpeg);

			// Video element stats
			const video = videoRef?.current;
			if (active && video) {
				// Buffer ahead of playhead
				let bufferSec = 0;
				const { buffered, currentTime } = video;
				for (let i = 0; i < buffered.length; i++) {
					if (buffered.start(i) <= currentTime + 0.5 && buffered.end(i) > currentTime) {
						bufferSec = Math.max(0, buffered.end(i) - currentTime);
						break;
					}
				}

				// Decoded / dropped frames
				const quality = video.getVideoPlaybackQuality();

				setVideoStats({
					bufferSec,
					decodedFrames: quality.totalVideoFrames,
					droppedFrames: quality.droppedVideoFrames
				});
			}
		};

		void tick();
		const id = setInterval(() => { void tick(); }, 1000);
		return () => {
			active = false;
			clearInterval(id);
		};
	}, [open, videoRef]);

	const videoStreams = (info?.streams ?? []).filter((s) => (s as StreamProbeStream).codec_type === "video") as StreamProbeStream[];
	const audioStreams = (info?.streams ?? []).filter((s) => (s as StreamProbeStream).codec_type === "audio") as StreamProbeStream[];
	const subStreams   = (info?.streams ?? []).filter((s) => (s as StreamProbeStream).codec_type === "subtitle") as StreamProbeStream[];
	const showFfmpegStats = Boolean(
		(ffmpegStats?.activeSessionCount ?? 0) > 0
		|| (ffmpegStats?.sourceCount ?? 0) > 0
	);

	return (
		<Dialog open={open} onClose={onClose} className="relative z-[60]">
			<div className="fixed inset-0 bg-black/60 backdrop-blur-sm" />
			<div className="fixed inset-0 flex items-stretch justify-end">
				<DialogPanel className="flex h-full w-full max-w-sm flex-col border-l border-white/10 bg-gray-950 text-white">

					{/* Header */}
					<div className="flex shrink-0 items-center justify-between border-b border-white/10 px-5 py-4">
						<DialogTitle className="flex items-center gap-2 text-lg font-bold">
							<InformationCircleIcon className="h-5 w-5 text-secondary-400" />
							Stream Info
						</DialogTitle>
						<button
							type="button"
							onClick={onClose}
							className="rounded-full p-1.5 text-gray-400 transition hover:bg-white/10 hover:text-white"
						>
							<XMarkIcon className="h-5 w-5" />
						</button>
					</div>

					{/* Body */}
					<div className="flex-1 overflow-y-auto">

						{/* ── Live Stats ───────────────────────────────── */}
						<section className="border-b border-white/[0.07] px-5 py-4">
							<SectionTitle>
								<span className="flex items-center gap-2">
									Application Usage
									<span className="inline-block h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
								</span>
							</SectionTitle>

							{(() => {
								const p = window.openIptv?.platformInfo;
								if (!p) return null;
								return (
									<Row
										label="Device"
										value={`${formatArch(p.arch)} ${formatPlatform(p.platform)}`}
									/>
								);
							})()}

							{!appStats ? (
								<p className="text-xs text-gray-500">Collecting…</p>
							) : (
								<div className="space-y-3">
									{/* CPU */}
									<div>
										<div className="mb-1.5 flex items-center justify-between text-xs">
											<span className="text-gray-500">App CPU</span>
											<span className="font-bold text-white">{appStats.cpuPercent}%</span>
										</div>
										<UsageBar percent={appStats.cpuPercent} color={barColor(appStats.cpuPercent)} />
									</div>

									{/* RAM */}
									<Row label="App RAM" value={formatMB(appStats.ramMB)} />
									<Row
										label="Network"
										value={`${formatKbps(appStats.networkKbps)}${appStats.networkMB > 0 ? ` / ${formatMB(appStats.networkMB)}` : ""}`}
									/>
									{appStats.activeStreams > 0 && (
										<Row label="Active streams" value={String(appStats.activeStreams)} />
									)}
									{appStats.gpuProcess && (
										<Row
											label="GPU process"
											value={`${appStats.gpuProcess.cpuPercent}% / ${formatMB(appStats.gpuProcess.ramMB)}`}
										/>
									)}

									{/* Per-process breakdown */}
									{appStats.processes.length > 1 && (
										<div className="space-y-0.5 rounded-xl bg-primary/10 px-3 py-2">
											{appStats.processes.map((p) => (
												<div key={p.pid} className="flex items-baseline justify-between py-0.5">
													<span className="text-xs text-gray-500">{p.type}</span>
													<span className="text-xs text-gray-400">{p.cpuPercent}% · {formatMB(p.ramMB)}</span>
												</div>
											))}
										</div>
									)}

									{/* Video element stats */}
									{videoStats && (
										<>
											<Row label="Buffer" value={`${videoStats.bufferSec.toFixed(1)}s ahead`} />
											<Row
												label="Frames"
												value={`${videoStats.decodedFrames.toLocaleString()} decoded${videoStats.droppedFrames > 0 ? ` · ${videoStats.droppedFrames} dropped` : ""}`}
											/>
										</>
									)}
								</div>
							)}
						</section>

						{/* ── Stream probe ─────────────────────────────── */}
						{showFfmpegStats && ffmpegStats && (
							<FfmpegServerSection stats={ffmpegStats} />
						)}

						{loading && (
							<div className="flex flex-col items-center justify-center gap-3 py-16">
								<div className="h-8 w-8 animate-spin rounded-full border-2 border-secondary-400 border-t-transparent" />
								<p className="text-sm text-gray-500">Fetching stream info…</p>
							</div>
						)}

						{!loading && !info?.ok && (
							<p className="px-5 py-10 text-center text-sm text-red-400">
								{info?.error ?? "No stream info available"}
							</p>
						)}

						{!loading && info?.ok && (
							<div className="divide-y divide-white/[0.07]">

								{/* Format */}
								{info.format && (
									<section className="px-5 py-4">
										<SectionTitle>Format</SectionTitle>
										<Row label="Container" value={formatContainer(info.format.format_name)} />
										<Row label="Duration" value={formatDuration(info.format.duration)} />
										<Row label="Bitrate" value={formatBitrate(info.format.bit_rate)} />
										{(info.format.nb_streams ?? 0) > 0 && (
											<Row label="Streams" value={String(info.format.nb_streams)} />
										)}
									</section>
								)}

								{/* Video */}
								{videoStreams.map((s) => (
									<VideoSection key={s.index} s={s} />
								))}

								{/* Audio */}
								{audioStreams.length > 0 && (
									<section className="px-5 py-4">
										<SectionTitle>
											Audio — {audioStreams.length} track{audioStreams.length !== 1 ? "s" : ""}
										</SectionTitle>
										<div className="space-y-2">
											{audioStreams.map((s) => (
												<AudioTrackCard key={s.index} s={s} />
											))}
										</div>
									</section>
								)}

								{/* Subtitles */}
								{subStreams.length > 0 && (
									<section className="px-5 py-4">
										<SectionTitle>
											Subtitles — {subStreams.length} track{subStreams.length !== 1 ? "s" : ""}
										</SectionTitle>
										<div>
											{subStreams.map((s) => (
												<SubtitleRow key={s.index} s={s} />
											))}
										</div>
									</section>
								)}

							</div>
						)}
					</div>

				</DialogPanel>
			</div>
		</Dialog>
	);
}
