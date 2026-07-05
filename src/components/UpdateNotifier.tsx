import { useEffect, useState } from "react";
import {
	ArrowPathIcon,
	ArrowDownTrayIcon,
	CheckCircleIcon,
	XMarkIcon,
} from "@heroicons/react/24/outline";

interface UpdateInfo {
	releaseName: string;
	releaseNotes?: string;
}

type UpdateState = "idle" | "available" | "downloaded";

/**
 * UpdateNotifier — displays a floating banner at the bottom of the screen
 * when a new version of OpenIPTV has been downloaded and is ready to install.
 *
 * It registers IPC listeners via window.openIptv and cleans them up on unmount.
 */
export default function UpdateNotifier() {
	const [state, setState] = useState<UpdateState>("idle");
	const [info, setInfo] = useState<UpdateInfo | null>(null);
	const [installing, setInstalling] = useState(false);
	const [dismissed, setDismissed] = useState(false);

	useEffect(() => {
		const api = window.openIptv;
		if (!api) return;

		// Register IPC listeners; both return a cleanup fn.
		const cleanAvailable = api.onUpdateAvailable(() => {
			setState("available");
		});

		const cleanDownloaded = api.onUpdateDownloaded((updateInfo) => {
			setInfo(updateInfo);
			setState("downloaded");
			setDismissed(false); // re-show if previously dismissed
		});

		return () => {
			cleanAvailable();
			cleanDownloaded();
		};
	}, []);

	async function handleInstall() {
		setInstalling(true);
		await window.openIptv?.installUpdate();
	}

	// Nothing to show
	if (state === "idle" || dismissed) return null;

	const ready = state === "downloaded";

	return (
		<div
			id="update-notifier"
			style={{ animation: "slideUpNotifier 0.4s cubic-bezier(0.16, 1, 0.3, 1)" }}
			className="fixed bottom-6 right-6 z-[9999] w-[calc(100vw-3rem)] max-w-sm overflow-hidden rounded-2xl border border-white/10 bg-dark/95 shadow-2xl shadow-black/50 backdrop-blur-xl"
		>
			{/* Accent bar — matches the app's secondary/purple accent */}
			<div className="h-[3px] bg-gradient-to-r from-secondary-300 via-secondary-400 to-secondary-500" />

			<div className="p-4">
				{/* Header */}
				<div className="mb-3 flex items-start gap-3">
					{/* Icon */}
					<div className="flex h-9 w-9 flex-none items-center justify-center rounded-xl border border-secondary-400/30 bg-secondary-400/10 text-secondary-400">
						{ready ? (
							<CheckCircleIcon className="h-5 w-5" />
						) : (
							<ArrowPathIcon className="h-5 w-5 animate-spin" />
						)}
					</div>

					<div className="min-w-0 flex-1">
						<p className="text-sm font-bold text-white">
							{ready
								? `Version ${info?.releaseName ?? "update"} ready`
								: "Update in progress…"}
						</p>
						<p className="mt-0.5 text-xs text-secondary-800">
							{ready
								? "Restart to apply the update."
								: "Downloading the new version…"}
						</p>
					</div>

					{/* Dismiss button */}
					<button
						id="update-notifier-dismiss"
						type="button"
						onClick={() => setDismissed(true)}
						aria-label="Dismiss notification"
						className="flex-none rounded-full p-1 text-secondary-800 transition hover:bg-white/10 hover:text-white"
					>
						<XMarkIcon className="h-4 w-4" />
					</button>
				</div>

				{/* Action button — only shown when update is ready */}
				{ready && (
					<button
						id="update-notifier-install"
						type="button"
						onClick={() => { void handleInstall(); }}
						disabled={installing}
						className="flex w-full items-center justify-center gap-2 rounded-lg bg-secondary-400 px-4 py-2.5 text-sm font-bold text-dark transition hover:bg-secondary disabled:cursor-wait disabled:opacity-70"
					>
						{installing ? (
							<>
								<ArrowPathIcon className="h-4 w-4 animate-spin" />
								Restarting…
							</>
						) : (
							<>
								<ArrowDownTrayIcon className="h-4 w-4" />
								Restart now
							</>
						)}
					</button>
				)}
			</div>

			<style>{`
				@keyframes slideUpNotifier {
					from { opacity: 0; transform: translateY(20px) scale(0.97); }
					to   { opacity: 1; transform: translateY(0)   scale(1); }
				}
			`}</style>
		</div>
	);
}
