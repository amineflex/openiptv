import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { useParams } from "react-router-dom";
import {
	ArrowDownTrayIcon,
	ArrowUpTrayIcon,
	CheckCircleIcon,
	ClockIcon,
	EyeIcon,
	EyeSlashIcon,
	FilmIcon,
	ServerStackIcon,
	ShieldExclamationIcon,
	TrashIcon
} from "@heroicons/react/24/outline";
import BackButton from "../components/BackButton";
import { useStreamLoader } from "../hooks/useStreamLoader";
import { configService } from "../services/configService";
import { storageService } from "../services/storageService";
import { streamCache } from "../services/streamCache";
import { historyService } from "../services/historyService";
import type { IptvStream, StreamInput, StreamSettings } from "../types";

type StreamField = keyof StreamInput;
type SettingField = keyof StreamSettings;

interface TextField {
	label: string;
	name: StreamField;
	type: "text" | "password";
	value: string;
	autoComplete: string;
}

function isValidDomain(value: string): boolean {
	try {
		const url = new URL(value);
		return url.protocol === "http:" || url.protocol === "https:";
	} catch {
		return false;
	}
}

export default function Settings() {
	const { id } = useParams();
	const loadedStream = useStreamLoader(id);
	const [stream, setStream] = useState<IptvStream | null>(null);
	const [saveMessage, setSaveMessage] = useState("");
	const [showPassword, setShowPassword] = useState(false);
	const [clearingCache, setClearingCache] = useState(false);
	const [cacheMessage, setCacheMessage] = useState("");
	const [dataMessage, setDataMessage] = useState("");
	const [dataError, setDataError] = useState("");
	const fileInputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (loadedStream) {
			setStream({ ...loadedStream, settings: { ...loadedStream.settings } });
		}
	}, [loadedStream]);

	const formFields: TextField[] = useMemo(() => {
		if (!stream) return [];

		return [
			{ label: "Stream name", name: "name", type: "text", value: stream.name, autoComplete: "off" },
			{ label: "Server URL", name: "domain", type: "text", value: stream.domain, autoComplete: "url" },
			{ label: "Username", name: "username", type: "text", value: stream.username, autoComplete: "username" },
			{ label: "Password", name: "password", type: "password", value: stream.password, autoComplete: "current-password" }
		];
	}, [stream]);

	const isFormValid = Boolean(
		stream?.name.trim()
		&& stream.domain.trim()
		&& isValidDomain(stream.domain.trim())
		&& stream.username.trim()
		&& stream.password.trim()
	);

	const handleStreamFieldChange = (event: ChangeEvent<HTMLInputElement>) => {
		const name = event.target.name as StreamField;
		const value = event.target.value;
		setStream((prev) => (prev ? { ...prev, [name]: value } : prev));
	};

	const updateSetting = <K extends SettingField>(name: K, value: StreamSettings[K]) => {
		setStream((prev) =>
			prev
				? {
					...prev,
					settings: {
						...prev.settings,
						[name]: value
					}
				}
				: prev
		);
	};

	const saveSettings = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (!id || !stream || !isFormValid) return;

		storageService.updateStream(id, {
			...stream,
			name: stream.name.trim(),
			domain: stream.domain.trim(),
			username: stream.username.trim()
		});
		// Trim existing history right away if the user lowered the cap.
		historyService.applyLimit(id, stream.settings.maxHistoryItems);
		setSaveMessage("Settings saved");
		setTimeout(() => setSaveMessage(""), 3000);
	};

	const clearCache = async () => {
		setClearingCache(true);
		await streamCache.clear();
		setClearingCache(false);
		setCacheMessage("Cache cleared");
		setTimeout(() => setCacheMessage(""), 3000);
	};

	const exportSettings = () => {
		const blob = new Blob([configService.export()], { type: "application/json" });
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement("a");
		anchor.href = url;
		anchor.download = `openiptv-backup-${new Date().toISOString().slice(0, 10)}.json`;
		document.body.appendChild(anchor);
		anchor.click();
		anchor.remove();
		URL.revokeObjectURL(url);
		setDataError("");
		setDataMessage("Settings exported");
		setTimeout(() => setDataMessage(""), 3000);
	};

	const importSettings = async (event: ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];
		event.target.value = ""; // let the same file be picked again later
		if (!file) return;

		if (!window.confirm("Import settings? This overwrites your current accounts and preferences, then reloads the app.")) {
			return;
		}

		const result = configService.import(await file.text());
		if (!result.ok) {
			setDataMessage("");
			setDataError(result.error ?? "Import failed");
			setTimeout(() => setDataError(""), 4000);
			return;
		}

		setDataError("");
		setDataMessage("Settings imported — reloading…");
		setTimeout(() => window.location.reload(), 800);
	};

	if (!stream) {
		return <p className="bg-dark text-secondary min-h-screen flex items-center justify-center">Loading...</p>;
	}

	const segmentBtn = (active: boolean) =>
		`rounded-lg py-2.5 text-sm font-semibold transition ${
			active ? "bg-secondary-400 text-dark shadow shadow-secondary-400/20" : "text-secondary hover:bg-white/5"
		}`;

	return (
		<div className="relative min-h-screen overflow-hidden bg-dark text-secondary">
			<div className="pointer-events-none absolute -top-32 right-1/4 h-[28rem] w-[28rem] rounded-full bg-secondary-400/10 blur-3xl" />
			<BackButton to={`/menu/${id}`} />

			<form onSubmit={saveSettings} className="fade-in relative mx-auto max-w-5xl px-6 pb-7 pt-16">
				<header className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
					<div>
						<h1 className="text-3xl font-bold text-white">Settings</h1>
						<p className="mt-1 text-sm text-secondary-800">{stream.name}</p>
					</div>
					<div className="flex items-center gap-3">
						{saveMessage && (
							<span className="inline-flex items-center gap-1.5 text-sm font-semibold text-green-400">
								<CheckCircleIcon className="h-5 w-5" />
								{saveMessage}
							</span>
						)}
						<button
							type="submit"
							disabled={!isFormValid}
							className="inline-flex items-center gap-2 rounded-xl bg-secondary-400 px-5 py-2 text-sm font-bold text-dark shadow-lg shadow-secondary-400/20 transition hover:bg-secondary disabled:cursor-not-allowed disabled:bg-primary/40 disabled:text-secondary-700 disabled:shadow-none"
						>
							<CheckCircleIcon className="h-5 w-5" />
							Save
						</button>
					</div>
				</header>

				<div className="space-y-5">
					<section className="grid gap-6 rounded-2xl border border-white/10 bg-white/[0.03] p-6 md:grid-cols-[240px_1fr]">
						<div className="flex items-start gap-3">
							<span className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary-400/15 text-secondary-400">
								<ServerStackIcon className="h-6 w-6" />
							</span>
							<div>
								<h2 className="text-lg font-bold text-white">Connection</h2>
								<p className="mt-1 text-sm text-secondary-800">Xtream account</p>
							</div>
						</div>

						<div className="grid gap-4 md:grid-cols-2">
							{formFields.map(({ label, name, type, value, autoComplete }) => {
								const isPassword = name === "password";
								const inputType = isPassword && showPassword ? "text" : type;

								return (
									<label key={name} className="block">
										<span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-secondary-700">{label}</span>
										<span className="relative block">
											<input
												type={inputType}
												name={name}
												autoComplete={autoComplete}
												className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-secondary outline-none transition focus:border-secondary-400 focus:bg-white/10"
												value={value}
												onChange={handleStreamFieldChange}
											/>
											{isPassword && (
												<button
													type="button"
													onClick={() => setShowPassword((value) => !value)}
													className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-secondary-700 transition hover:bg-white/10 hover:text-secondary"
												>
													{showPassword ? <EyeSlashIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
												</button>
											)}
										</span>
										{name === "domain" && stream.domain.trim() && !isValidDomain(stream.domain.trim()) && (
											<span className="mt-2 block text-sm text-red-400">Use an http:// or https:// server URL</span>
										)}
									</label>
								);
							})}
						</div>
					</section>

					<section className="grid gap-6 rounded-2xl border border-white/10 bg-white/[0.03] p-6 md:grid-cols-[240px_1fr]">
						<div className="flex items-start gap-3">
							<span className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary-400/15 text-secondary-400">
								<FilmIcon className="h-6 w-6" />
							</span>
							<div>
								<h2 className="text-lg font-bold text-white">Playback</h2>
								<p className="mt-1 text-sm text-secondary-800">Stream behavior</p>
							</div>
						</div>

						<div className="grid gap-6 md:grid-cols-2">
							<div>
								<span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-secondary-700">Live stream format</span>
								<div className="grid grid-cols-2 gap-1 rounded-xl border border-white/10 bg-white/5 p-1">
									{(["ts", "m3u8"] as const).map((format) => (
										<button
											key={format}
											type="button"
											onClick={() => updateSetting("streamFormat", format)}
											className={segmentBtn(stream.settings.streamFormat === format)}
										>
											.{format}
										</button>
									))}
								</div>
							</div>

							<div>
								<span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-secondary-700">Channels per load (Live TV)</span>
								<div className="grid grid-cols-3 gap-1 rounded-xl border border-white/10 bg-white/5 p-1">
									{([100, 200, 500] as const).map((count) => (
										<button
											key={count}
											type="button"
											onClick={() => updateSetting("maxChannelsPerCategory", count)}
											className={segmentBtn(stream.settings.maxChannelsPerCategory === count)}
										>
											{count}
										</button>
									))}
								</div>
							</div>

							<div>
								<span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-secondary-700">Items per page (VOD &amp; Series)</span>
								<div className="grid grid-cols-4 gap-1 rounded-xl border border-white/10 bg-white/5 p-1">
									{([20, 50, 100, 200] as const).map((count) => (
										<button
											key={count}
											type="button"
											onClick={() => updateSetting("maxVodPerPage", count)}
											className={segmentBtn((stream.settings.maxVodPerPage ?? 50) === count)}
										>
											{count}
										</button>
									))}
								</div>
							</div>

							<div>
								<span className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-secondary-700">
									<ClockIcon className="h-4 w-4" />
									History size (recently watched)
								</span>
								<div className="grid grid-cols-4 gap-1 rounded-xl border border-white/10 bg-white/5 p-1">
									{([10, 30, 50, 100] as const).map((count) => (
										<button
											key={count}
											type="button"
											onClick={() => updateSetting("maxHistoryItems", count)}
											className={segmentBtn((stream.settings.maxHistoryItems ?? 30) === count)}
										>
											{count}
										</button>
									))}
								</div>
							</div>
						</div>
					</section>

					<section className="grid gap-6 rounded-2xl border border-white/10 bg-white/[0.03] p-6 md:grid-cols-[240px_1fr]">
						<div className="flex items-start gap-3">
							<span className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary-400/15 text-secondary-400">
								<ShieldExclamationIcon className="h-6 w-6" />
							</span>
							<div>
								<h2 className="text-lg font-bold text-white">Preferences</h2>
								<p className="mt-1 text-sm text-secondary-800">Display filters</p>
							</div>
						</div>

						<div className="grid gap-6 md:grid-cols-2">
							<div>
								<span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-secondary-700">Adult content</span>
								<button
									type="button"
									aria-pressed={stream.settings.adultChannel}
									onClick={() => updateSetting("adultChannel", !stream.settings.adultChannel)}
									className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition ${stream.settings.adultChannel ? "border-secondary-400 bg-secondary-400 text-dark" : "border-white/10 bg-white/5 text-secondary hover:bg-white/10"}`}
								>
									<span className="font-semibold">{stream.settings.adultChannel ? "Enabled" : "Disabled"}</span>
									<span className={`h-6 w-11 rounded-full p-1 ${stream.settings.adultChannel ? "bg-dark/25" : "bg-dark"}`}>
										<span className={`block h-4 w-4 rounded-full bg-secondary transition ${stream.settings.adultChannel ? "translate-x-5" : ""}`} />
									</span>
								</button>
							</div>

							<div>
								<span className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-secondary-700">
									<ClockIcon className="h-4 w-4" />
									Hour format
								</span>
								<div className="grid grid-cols-2 gap-1 rounded-xl border border-white/10 bg-white/5 p-1">
									{(["24H", "12H"] as const).map((format) => (
										<button
											key={format}
											type="button"
											onClick={() => updateSetting("hourFormat", format)}
											className={segmentBtn(stream.settings.hourFormat === format)}
										>
											{format}
										</button>
									))}
								</div>
							</div>
						</div>
					</section>

					<section className="grid gap-6 rounded-2xl border border-white/10 bg-white/[0.03] p-6 md:grid-cols-[240px_1fr]">
						<div className="flex items-start gap-3">
							<span className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary-400/15 text-secondary-400">
								<TrashIcon className="h-6 w-6" />
							</span>
							<div>
								<h2 className="text-lg font-bold text-white">Data</h2>
								<p className="mt-1 text-sm text-secondary-800">Cache &amp; backup</p>
							</div>
						</div>

						<div className="flex flex-col gap-5">
							<div className="flex flex-col gap-3">
								<p className="text-sm text-secondary-800">
									Channel, movie and series lists are cached so they load instantly. Clear the cache if lists look out of date.
								</p>
								<div className="flex items-center gap-3">
									<button
										type="button"
										onClick={() => void clearCache()}
										disabled={clearingCache}
										className="inline-flex items-center gap-2 self-start rounded-xl border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-bold text-secondary transition hover:border-red-400/50 hover:bg-red-400/10 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-50"
									>
										<TrashIcon className="h-5 w-5" />
										{clearingCache ? "Clearing..." : "Clear cache"}
									</button>
									{cacheMessage && (
										<span className="inline-flex items-center gap-1.5 text-sm font-semibold text-green-400">
											<CheckCircleIcon className="h-5 w-5" />
											{cacheMessage}
										</span>
									)}
								</div>
							</div>

							<div className="flex flex-col gap-3 border-t border-white/10 pt-5">
								<p className="text-sm text-secondary-800">
									Export your accounts, preferences, favourites and watch history to a file, or import a previous backup.
								</p>
								<div className="flex flex-wrap items-center gap-3">
									<button
										type="button"
										onClick={exportSettings}
										className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-bold text-secondary transition hover:border-secondary-400/50 hover:text-secondary-400"
									>
										<ArrowDownTrayIcon className="h-5 w-5" />
										Export settings
									</button>
									<button
										type="button"
										onClick={() => fileInputRef.current?.click()}
										className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-bold text-secondary transition hover:border-secondary-400/50 hover:text-secondary-400"
									>
										<ArrowUpTrayIcon className="h-5 w-5" />
										Import settings
									</button>
									<input
										ref={fileInputRef}
										type="file"
										accept="application/json,.json"
										onChange={(event) => void importSettings(event)}
										className="hidden"
									/>
									{dataMessage && (
										<span className="inline-flex items-center gap-1.5 text-sm font-semibold text-green-400">
											<CheckCircleIcon className="h-5 w-5" />
											{dataMessage}
										</span>
									)}
									{dataError && (
										<span className="text-sm font-semibold text-red-400">{dataError}</span>
									)}
								</div>
							</div>
						</div>
					</section>
				</div>


			</form>
		</div>
	);
}
