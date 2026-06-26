import type { MouseEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
	ArrowDownTrayIcon,
	ArrowPathIcon,
	FolderOpenIcon,
	PlayIcon,
	XMarkIcon
} from "@heroicons/react/24/outline";
import { CheckCircleIcon as CheckSolidIcon } from "@heroicons/react/24/solid";
import { useDownloads } from "../hooks/useDownloads";
import { formatSpeed } from "../services/downloadsService";
import { buildWatchRoute } from "../services/watchRoute";
import type { DownloadStartInput } from "../types";

interface DownloadButtonProps {
	item: DownloadStartInput;
	// "full" = labelled pills (detail pages); "compact" = round icon buttons
	// (overlaid on episode cards, where the wrapper is itself a link).
	variant?: "full" | "compact";
}

// Small SVG ring used while a download is in flight. A negative percent renders
// an indeterminate spinner (server gave no Content-Length).
function ProgressRing({ percent, size = 18 }: { percent: number; size?: number }) {
	const stroke = 2.5;
	const radius = (size - stroke) / 2;
	const circumference = 2 * Math.PI * radius;
	const indeterminate = percent < 0;
	const clamped = Math.max(0, Math.min(100, percent));
	const offset = indeterminate ? circumference * 0.7 : circumference * (1 - clamped / 100);

	return (
		<svg
			width={size}
			height={size}
			viewBox={`0 0 ${size} ${size}`}
			className={indeterminate ? "animate-spin" : ""}
			aria-hidden="true"
		>
			<circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="currentColor" strokeOpacity={0.25} strokeWidth={stroke} />
			<circle
				cx={size / 2}
				cy={size / 2}
				r={radius}
				fill="none"
				stroke="currentColor"
				strokeWidth={stroke}
				strokeLinecap="round"
				strokeDasharray={circumference}
				strokeDashoffset={offset}
				transform={`rotate(-90 ${size / 2} ${size / 2})`}
			/>
		</svg>
	);
}

export default function DownloadButton({ item, variant = "full" }: DownloadButtonProps) {
	const navigate = useNavigate();
	const { records, speeds, available, start, cancel, playback, openFile, reveal, openFolder } = useDownloads();

	if (!available) return null;

	const record = records[item.id];
	const status = record?.status;
	const isActive = status === "downloading" || status === "queued";
	const isDone = status === "completed";
	const isError = status === "error";
	const percent =
		status === "downloading" && record && record.total > 0
			? (record.received / record.total) * 100
			: -1;
	const speed = speeds[item.id];

	// These controls live inside <Link> cards — stop the click from navigating.
	const stop = (event: MouseEvent) => {
		event.preventDefault();
		event.stopPropagation();
	};
	// Play the saved file in the app's own player (falls back to the OS player if
	// the local media server can't be reached).
	const playInApp = async () => {
		const result = await playback(item.id);
		if (result.ok && result.url) {
			navigate(
				buildWatchRoute({
					src: result.url,
					type: "vod",
					channel: item.title,
					category: item.subtitle,
					icon: item.image
				}),
				{ state: { subtitles: result.subtitles ?? [], backTo: item.route, backLabel: item.title } }
			);
		} else {
			void openFile(item.id);
		}
	};

	const handleDownload = (e: MouseEvent) => { stop(e); void start(item); };
	const handleCancel = (e: MouseEvent) => { stop(e); void cancel(item.id); };
	const handleOpen = (e: MouseEvent) => { stop(e); void playInApp(); };
	const handleFolder = (e: MouseEvent) => {
		stop(e);
		void (isDone ? reveal(item.id) : openFolder());
	};

	if (variant === "compact") {
		const round = "rounded-full p-2 backdrop-blur transition";
		return (
			<div className="flex items-center gap-1.5" onClick={stop}>
				{isDone ? (
					<button type="button" onClick={handleOpen} title="Lire le téléchargement" className={`${round} bg-emerald-500/90 text-white hover:bg-emerald-400`}>
						<PlayIcon className="h-4 w-4" />
					</button>
				) : isActive ? (
					<button type="button" onClick={handleCancel} title="Annuler le téléchargement" className={`${round} relative bg-dark/70 text-secondary-400 hover:text-white`}>
						<ProgressRing percent={percent} size={20} />
						<span className="absolute inset-0 flex items-center justify-center text-[8px] font-bold tabular-nums">
							{percent >= 0 ? Math.round(percent) : ""}
						</span>
					</button>
				) : (
					<button type="button" onClick={handleDownload} title={isError ? `Réessayer — ${record?.error ?? "échec"}` : "Télécharger"} className={`${round} bg-dark/70 text-white hover:bg-secondary-400 hover:text-dark`}>
						{isError ? <ArrowPathIcon className="h-4 w-4" /> : <ArrowDownTrayIcon className="h-4 w-4" />}
					</button>
				)}

				<button type="button" onClick={handleFolder} title="Voir le dossier" className={`${round} bg-dark/70 text-white hover:bg-secondary-400 hover:text-dark`}>
					<FolderOpenIcon className="h-4 w-4" />
				</button>
			</div>
		);
	}

	const pill = "inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition";
	return (
		<div className="flex items-center gap-2">
			{isDone ? (
				<button type="button" onClick={handleOpen} title="Lire le fichier téléchargé" className={`${pill} bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25`}>
					<CheckSolidIcon className="h-5 w-5" />
					Downloaded
				</button>
			) : isActive ? (
				<button type="button" onClick={handleCancel} title="Annuler le téléchargement" className={`${pill} bg-primary/20 text-secondary hover:bg-red-600/80 hover:text-white`}>
					<ProgressRing percent={percent} size={18} />
					<span className="tabular-nums">{percent >= 0 ? `${Math.round(percent)}%` : "Starting…"}</span>
					{speed ? <span className="text-xs font-medium text-secondary-700">{formatSpeed(speed)}</span> : null}
					<XMarkIcon className="h-4 w-4 opacity-70" />
				</button>
			) : (
				<button type="button" onClick={handleDownload} title={isError ? record?.error : "Télécharger pour regarder hors-ligne"} className={`${pill} bg-primary/20 text-secondary hover:bg-primary/40`}>
					{isError ? <ArrowPathIcon className="h-5 w-5" /> : <ArrowDownTrayIcon className="h-5 w-5" />}
					{isError ? "Retry" : "Download"}
				</button>
			)}

			<button type="button" onClick={handleFolder} title="Voir le dossier" className={`${pill} bg-primary/20 px-3 text-secondary hover:bg-primary/40`}>
				<FolderOpenIcon className="h-5 w-5" />
			</button>
		</div>
	);
}
