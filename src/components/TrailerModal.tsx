import { Dialog, DialogPanel } from "@headlessui/react";
import { ArrowTopRightOnSquareIcon, XMarkIcon } from "@heroicons/react/24/outline";

interface TrailerModalProps {
	open: boolean;
	onClose: () => void;
	trailer: string;
	title?: string;
}

/**
 * Accepts a raw YouTube id (the Xtream format) or any common YouTube URL and
 * returns the 11-char video id, or null if nothing usable is found.
 */
export function extractYouTubeId(value: string | undefined | null): string | null {
	if (!value) return null;
	const trimmed = value.trim();
	if (!trimmed) return null;

	// Bare id (letters, digits, - and _).
	if (/^[\w-]{11}$/.test(trimmed)) return trimmed;

	try {
		const url = new URL(trimmed);
		if (url.hostname.includes("youtu.be")) {
			const id = url.pathname.split("/").filter(Boolean)[0];
			return id && /^[\w-]{11}$/.test(id) ? id : null;
		}
		const fromQuery = url.searchParams.get("v");
		if (fromQuery && /^[\w-]{11}$/.test(fromQuery)) return fromQuery;
		const match = url.pathname.match(/\/(?:embed|shorts)\/([\w-]{11})/);
		if (match) return match[1];
	} catch {
		// Not a URL — fall through.
	}
	return null;
}

export default function TrailerModal({ open, onClose, trailer, title }: TrailerModalProps) {
	const videoId = extractYouTubeId(trailer);

	return (
		<Dialog open={open && Boolean(videoId)} onClose={onClose} className="relative z-[70]">
			<div className="fixed inset-0 bg-black/80 backdrop-blur-sm" />
			<div className="fixed inset-0 flex items-center justify-center p-4">
				<DialogPanel className="relative w-full max-w-4xl overflow-hidden rounded-2xl border border-white/10 bg-dark shadow-2xl shadow-black/60">
					<div className="flex items-center justify-between gap-4 border-b border-white/10 px-5 py-3">
						<h2 className="truncate text-sm font-bold text-white">{title ? `${title} — Trailer` : "Trailer"}</h2>
						<div className="flex flex-none items-center gap-1">
							{videoId && (
								<button
									type="button"
									onClick={() => void window.openIptv?.openExternal?.(`https://www.youtube.com/watch?v=${videoId}`)}
									title="Watch on YouTube"
									className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-semibold text-secondary-700 transition hover:bg-white/10 hover:text-white"
								>
									<ArrowTopRightOnSquareIcon className="h-4 w-4" />
									YouTube
								</button>
							)}
							<button
								type="button"
								onClick={onClose}
								aria-label="Close trailer"
								className="rounded-full p-1.5 text-secondary-700 transition hover:bg-white/10 hover:text-white"
							>
								<XMarkIcon className="h-5 w-5" />
							</button>
						</div>
					</div>
					<div className="aspect-video w-full bg-black">
						{videoId && (
							<iframe
								key={videoId}
								src={`https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0`}
								title={title ? `${title} trailer` : "Trailer"}
								allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
								allowFullScreen
								className="h-full w-full border-0"
							/>
						)}
					</div>
				</DialogPanel>
			</div>
		</Dialog>
	);
}
