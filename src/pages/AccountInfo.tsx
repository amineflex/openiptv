import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import {
	CheckCircleIcon,
	ClockIcon,
	ServerStackIcon,
	ShieldCheckIcon,
	SignalIcon,
	UserCircleIcon,
	XCircleIcon
} from "@heroicons/react/24/outline";
import BackButton from "../components/BackButton";
import LoadingSpinner from "../components/LoadingSpinner";
import NotFound from "../components/NotFound";
import { useStreamLoader } from "../hooks/useStreamLoader";
import { apiService } from "../services/apiService";
import { formatXtreamDate } from "../services/dateService";
import { storageService } from "../services/storageService";
import type { StreamInfo } from "../types";

interface AccountRow {
	label: string;
	value: string;
	icon: typeof UserCircleIcon;
	accent?: string;
}

function normalizeValue(value: unknown, fallback = "Unknown"): string {
	if (value === null || value === undefined || value === "") return fallback;
	return String(value);
}

function formatTrial(value: unknown): string {
	return String(value ?? "0") === "1" ? "Yes" : "No";
}

function getStatusTone(status: string): string {
	return status.toLowerCase() === "active"
		? "border-green-400/30 bg-green-400/10 text-green-300"
		: "border-red-400/30 bg-red-400/10 text-red-300";
}

export default function AccountInfo() {
	const { id } = useParams();
	const stream = useStreamLoader(id);
	const [streamInfo, setStreamInfo] = useState<StreamInfo | null>(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		if (!stream) return;

		const controller = new AbortController();

		const fetchAccountInfo = async () => {
			setLoading(true);
			const info = await apiService.fetchStreamInfo(stream, controller.signal);
			if (controller.signal.aborted) return;

			setStreamInfo(info);
			setLoading(false);

			const expDate = info?.user_info?.exp_date ?? null;
			if (id && expDate !== null && expDate !== stream.expDate) {
				storageService.updateStream(id, { expDate });
			}
		};

		void fetchAccountInfo();

		return () => controller.abort();
	}, [id, stream]);

	const userInfo = streamInfo?.user_info;
	const accountStatus = normalizeValue(userInfo?.status, "Unknown");
	const expireDate = formatXtreamDate(userInfo?.exp_date ?? stream?.expDate);
	const createdAt = formatXtreamDate(userInfo?.created_at);

	const accountRows = useMemo<AccountRow[]>(() => [
		{
			label: "Username",
			value: normalizeValue(userInfo?.username ?? stream?.username),
			icon: UserCircleIcon
		},
		{
			label: "Account status",
			value: accountStatus,
			icon: accountStatus.toLowerCase() === "active" ? CheckCircleIcon : XCircleIcon,
			accent: getStatusTone(accountStatus)
		},
		{
			label: "Expire date",
			value: expireDate,
			icon: ClockIcon
		},
		{
			label: "Is trial",
			value: formatTrial(userInfo?.is_trial),
			icon: ShieldCheckIcon
		},
		{
			label: "Active connections",
			value: normalizeValue(userInfo?.active_cons, "0"),
			icon: SignalIcon
		},
		{
			label: "Max connections",
			value: normalizeValue(userInfo?.max_connections, "Unknown"),
			icon: ServerStackIcon
		},
		{
			label: "Created at",
			value: createdAt,
			icon: ClockIcon
		},
		{
			label: "Profile",
			value: normalizeValue(stream?.name),
			icon: UserCircleIcon
		}
	], [accountStatus, createdAt, expireDate, stream?.name, stream?.username, userInfo]);

	if (!stream) {
		return <NotFound message="Stream not found" />;
	}

	return (
		<div className="relative min-h-screen overflow-hidden bg-dark text-secondary">
			<div className="pointer-events-none absolute inset-0">
				<div className="absolute left-1/2 top-[-18rem] h-[42rem] w-[42rem] -translate-x-1/2 rounded-full bg-secondary-400/10 blur-3xl" />
				<div className="absolute bottom-[-12rem] right-[-8rem] h-[32rem] w-[32rem] rounded-full bg-sky-400/10 blur-3xl" />
			</div>

			<BackButton to={`/menu/${id}`} />
			<div className="fade-in relative mx-auto flex min-h-screen max-w-6xl flex-col px-6 pb-7 pt-16">
				<header className="flex flex-col gap-5 border-b border-white/10 pb-6 md:flex-row md:items-center md:justify-between">
					<div>
						<p className="text-xs font-semibold uppercase tracking-widest text-secondary-700">OpenIPTV</p>
						<h1 className="mt-1 text-3xl font-bold text-white">Account Info</h1>
					</div>
				</header>

				<main className="grid flex-1 gap-6 py-8 lg:grid-cols-[360px_1fr]">
					<section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur">
						<div className="flex h-full flex-col justify-between gap-8">
							<div>
								<div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-secondary-400/15 text-secondary-400 ring-1 ring-secondary-400/20">
									<UserCircleIcon className="h-12 w-12" />
								</div>
								<p className="mt-6 text-xs font-semibold uppercase tracking-widest text-secondary-700">Connected as</p>
								<h2 className="mt-2 break-all text-3xl font-bold text-white">{userInfo?.username ?? stream.username}</h2>
								<div className={`mt-5 inline-flex rounded-full border px-3 py-1 text-sm font-bold ${getStatusTone(accountStatus)}`}>
									{accountStatus}
								</div>
							</div>

							<div className="rounded-xl border border-white/10 bg-dark/40 p-4">
								<p className="text-xs font-semibold uppercase tracking-wide text-secondary-700">Server</p>
								<p className="mt-1 truncate text-sm font-semibold text-secondary-800">{stream.domain}</p>
							</div>
						</div>
					</section>

					<section className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur">
						<div className="border-b rounded-t-2xl border-white/10 bg-gradient-to-r from-secondary-400/20 via-sky-400/10 to-transparent px-6 py-5">
							<h2 className="text-2xl font-bold text-white">Account details</h2>
							<p className="mt-1 text-sm text-secondary-700">Live information from your IPTV provider.</p>
						</div>

						{loading ? (
							<div className="flex min-h-96 items-center justify-center">
								<LoadingSpinner />
							</div>
						) : (
							<div className="grid gap-px overflow-hidden rounded-b-2xl bg-white/10 md:grid-cols-2">
								{accountRows.map(({ label, value, icon: Icon, accent }) => (
									<div key={label} className="bg-dark/80 p-5">
										<div className="flex items-center gap-4">
											<span className={`flex h-11 w-11 flex-none items-center justify-center rounded-xl border border-white/10 bg-white/5 text-secondary-400 ${accent ?? ""}`}>
												<Icon className="h-6 w-6" />
											</span>
											<div className="min-w-0">
												<p className="text-xs font-semibold uppercase tracking-wide text-secondary-700">{label}</p>
												<p className="mt-1 break-words text-lg font-bold text-white">{value}</p>
											</div>
										</div>
									</div>
								))}
							</div>
						)}
					</section>
				</main>
			</div>
		</div>
	);
}
