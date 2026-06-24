import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ClockIcon, PencilIcon, TrashIcon, TvIcon } from "@heroicons/react/24/outline";
import { apiService } from "../services/apiService";
import { getExpiryInfo } from "../services/dateService";
import { storageService } from "../services/storageService";
import type { ExpiryTone } from "../services/dateService";
import type { IptvStream } from "../types";

interface StreamCardProps {
	stream: IptvStream;
	onEdit: (stream: IptvStream) => void;
	onDelete: (id: string) => void;
}

/** Strip the protocol and any trailing slash so the host reads cleanly. */
function displayHost(domain: string): string {
	return domain.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
}

const toneClasses: Record<ExpiryTone, string> = {
	ok: "border-green-400/30 bg-green-400/10 text-green-300",
	soon: "border-amber-400/30 bg-amber-400/10 text-amber-300",
	expired: "border-red-400/30 bg-red-400/10 text-red-300",
	unknown: "border-white/10 bg-white/5 text-secondary-700"
};

function expiryText(formatted: string, daysLeft: number | null, tone: ExpiryTone): string {
	if (tone === "expired") return `Expired ${formatted}`;
	if (tone === "unknown") return "Expiry unknown";
	if (daysLeft === 0) return `${formatted} · today`;
	return `${formatted} · ${daysLeft}d left`;
}

export default function StreamCard({ stream, onEdit, onDelete }: StreamCardProps) {
	const [expDate, setExpDate] = useState<string | number | null | undefined>(stream.expDate);

	// Show the stored value instantly, then silently refresh from the provider.
	useEffect(() => {
		const controller = new AbortController();

		const refreshExpiry = async () => {
			try {
				const info = await apiService.fetchStreamInfo(stream, controller.signal);
				if (controller.signal.aborted) return;

				const next = info?.user_info?.exp_date ?? null;
				if (next === null) return;

				setExpDate(next);
				if (next !== stream.expDate) {
					storageService.updateStream(stream.id, { expDate: next });
				}
			} catch {
				/* offline or unreachable — keep whatever was stored */
			}
		};

		void refreshExpiry();
		return () => controller.abort();
	}, [stream]);

	const { formatted, daysLeft, tone } = getExpiryInfo(expDate);

	return (
		<div className="group relative">
			<Link
				to={`/menu/${stream.id}`}
				className="flex h-full min-h-[190px] flex-col items-center justify-center gap-3 rounded-2xl border border-white/10 bg-gradient-to-br from-primary/30 to-dark/40 p-6 text-center shadow-lg shadow-black/30 transition duration-200 hover:-translate-y-1 hover:border-secondary-400/60 hover:shadow-xl hover:shadow-secondary-400/20"
			>
				<span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-secondary-400/15 text-secondary-400 ring-1 ring-secondary-400/30 transition group-hover:bg-secondary-400 group-hover:text-dark">
					<TvIcon className="h-8 w-8" />
				</span>
				<div className="min-w-0">
					<p className="truncate text-lg font-bold text-white">{stream.name}</p>
					<p className="mt-0.5 max-w-[13rem] truncate text-xs text-secondary-700">{displayHost(stream.domain)}</p>
				</div>

				<span
					className={`mt-1 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${toneClasses[tone]}`}
					title={tone === "unknown" ? undefined : `Subscription ends ${formatted}`}
				>
					<ClockIcon className="h-3.5 w-3.5 flex-none" />
					<span className="truncate">{expiryText(formatted, daysLeft, tone)}</span>
				</span>
			</Link>

			<div className="absolute right-3 top-3 flex gap-1.5 opacity-0 transition duration-150 group-hover:opacity-100">
				<button
					type="button"
					onClick={() => onEdit(stream)}
					title="Edit"
					className="rounded-full bg-dark/70 p-2 text-secondary-400 backdrop-blur hover:bg-secondary-400 hover:text-dark"
				>
					<PencilIcon className="h-4 w-4" />
				</button>
				<button
					type="button"
					onClick={() => onDelete(stream.id)}
					title="Delete"
					className="rounded-full bg-dark/70 p-2 text-red-300 backdrop-blur hover:bg-red-500 hover:text-white"
				>
					<TrashIcon className="h-4 w-4" />
				</button>
			</div>
		</div>
	);
}
