import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import {
	ArrowLeftIcon,
	CheckCircleIcon,
	ClockIcon,
	EyeIcon,
	EyeSlashIcon,
	FilmIcon,
	ServerStackIcon,
	ShieldExclamationIcon
} from "@heroicons/react/24/outline";
import { useStreamLoader } from "../hooks/useStreamLoader";
import { storageService } from "../services/storageService";
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

			<form onSubmit={saveSettings} className="fade-in relative mx-auto max-w-5xl px-6 py-7">
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
						<Link
							to={`/menu/${id}`}
							className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold transition hover:bg-white/10"
						>
							<ArrowLeftIcon className="h-5 w-5" />
							Back
						</Link>
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
				</div>


			</form>
		</div>
	);
}
