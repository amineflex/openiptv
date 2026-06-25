import { useEffect, useState } from "react";

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

	return (
		<div
			id="update-notifier"
			style={{
				position: "fixed",
				bottom: "24px",
				right: "24px",
				zIndex: 9999,
				maxWidth: "360px",
				width: "calc(100vw - 48px)",
				borderRadius: "16px",
				overflow: "hidden",
				// Glassmorphism card
				background: "rgba(15, 15, 25, 0.82)",
				backdropFilter: "blur(24px)",
				WebkitBackdropFilter: "blur(24px)",
				border: "1px solid rgba(139, 92, 246, 0.35)",
				boxShadow: "0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04) inset",
				animation: "slideUpNotifier 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
			}}
		>
			{/* Purple accent bar */}
			<div style={{
				height: "3px",
				background: "linear-gradient(90deg, #7c3aed, #a855f7, #c084fc)",
			}} />

			<div style={{ padding: "16px 18px 18px" }}>
				{/* Header */}
				<div style={{ display: "flex", alignItems: "flex-start", gap: "12px", marginBottom: "12px" }}>
					{/* Icon */}
					<div style={{
						flexShrink: 0,
						width: "36px",
						height: "36px",
						borderRadius: "10px",
						background: "linear-gradient(135deg, #7c3aed22, #a855f711)",
						border: "1px solid rgba(139, 92, 246, 0.3)",
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
					}}>
						{state === "downloaded" ? (
							// Download done — checkmark arrow
							<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#a855f7" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
								<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
								<polyline points="7 10 12 15 17 10" />
								<line x1="12" y1="15" x2="12" y2="3" />
							</svg>
						) : (
							// Downloading — spinner
							<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#a855f7" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: "spin 1.5s linear infinite" }}>
								<path d="M21 12a9 9 0 1 1-6.219-8.56" />
							</svg>
						)}
					</div>

					<div style={{ flex: 1, minWidth: 0 }}>
						<p style={{
							margin: 0,
							fontSize: "13px",
							fontWeight: 600,
							color: "#f0f0f5",
							letterSpacing: "0.01em",
							lineHeight: 1.3,
						}}>
							{state === "downloaded"
								? `Version ${info?.releaseName ?? "nouvelle"} prête`
								: "Mise à jour en cours…"}
						</p>
						<p style={{
							margin: "3px 0 0",
							fontSize: "11.5px",
							color: "rgba(200,200,220,0.6)",
							lineHeight: 1.4,
						}}>
							{state === "downloaded"
								? "Redémarrez pour appliquer la mise à jour."
								: "Téléchargement de la nouvelle version…"}
						</p>
					</div>

					{/* Dismiss button */}
					<button
						id="update-notifier-dismiss"
						onClick={() => setDismissed(true)}
						style={{
							flexShrink: 0,
							background: "none",
							border: "none",
							cursor: "pointer",
							padding: "2px",
							color: "rgba(200,200,220,0.4)",
							lineHeight: 1,
							transition: "color 0.15s",
						}}
						onMouseEnter={e => (e.currentTarget.style.color = "rgba(200,200,220,0.8)")}
						onMouseLeave={e => (e.currentTarget.style.color = "rgba(200,200,220,0.4)")}
						aria-label="Fermer la notification"
					>
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
							<line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
						</svg>
					</button>
				</div>

				{/* Action button — only shown when update is ready */}
				{state === "downloaded" && (
					<button
						id="update-notifier-install"
						onClick={() => { void handleInstall(); }}
						disabled={installing}
						style={{
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							gap: "7px",
							width: "100%",
							padding: "9px 16px",
							borderRadius: "10px",
							border: "none",
							cursor: installing ? "wait" : "pointer",
							background: installing
								? "rgba(139, 92, 246, 0.25)"
								: "linear-gradient(135deg, #7c3aed, #9333ea)",
							color: "#fff",
							fontSize: "12.5px",
							fontWeight: 600,
							letterSpacing: "0.02em",
							boxShadow: installing ? "none" : "0 2px 12px rgba(139, 92, 246, 0.4)",
							transition: "all 0.2s ease",
							opacity: installing ? 0.7 : 1,
						}}
						onMouseEnter={e => {
							if (!installing) e.currentTarget.style.transform = "translateY(-1px)";
						}}
						onMouseLeave={e => { e.currentTarget.style.transform = ""; }}
					>
						{installing ? (
							<>
								<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ animation: "spin 1s linear infinite" }}>
									<path d="M21 12a9 9 0 1 1-6.219-8.56" />
								</svg>
								Redémarrage…
							</>
						) : (
							<>
								<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
									<polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
									<path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
								</svg>
								Redémarrer maintenant
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
				@keyframes spin {
					from { transform: rotate(0deg); }
					to   { transform: rotate(360deg); }
				}
			`}</style>
		</div>
	);
}
