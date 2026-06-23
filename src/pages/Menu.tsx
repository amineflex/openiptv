import { useState, useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import {
	ArrowLeftIcon,
	ArrowRightIcon,
	Cog6ToothIcon,
	FilmIcon,
	HeartIcon,
	CalendarDaysIcon,
	TvIcon,
	UserCircleIcon,
	VideoCameraIcon
} from "@heroicons/react/24/outline";
import { useStreamLoader } from "../hooks/useStreamLoader";
import NotFound from "../components/NotFound";
import { apiService } from "../services/apiService";
import { storageService } from "../services/storageService";

interface MenuItem {
	title: string;
	description: string;
	to: string;
	accent: string;
	icon: typeof TvIcon;
}

function formatTime(hourFormat: "12H" | "24H"): string {
	return new Intl.DateTimeFormat(undefined, {
		hour: "2-digit",
		minute: "2-digit",
		hour12: hourFormat === "12H"
	}).format(new Date());
}

function formatDate(): string {
	return new Intl.DateTimeFormat(undefined, {
		weekday: "long",
		day: "numeric",
		month: "long"
	}).format(new Date());
}

function formatExpirationDate(value?: string | number | null): string {
	if (!value) return "Unknown";

	const timestamp = Number(value);
	const date = Number.isFinite(timestamp)
		? new Date(timestamp * 1000)
		: new Date(value);

	if (Number.isNaN(date.getTime())) return "Unknown";

	return new Intl.DateTimeFormat(undefined, {
		year: "numeric",
		month: "short",
		day: "2-digit"
	}).format(date);
}

export default function Menu() {
	const { id } = useParams();
	const stream = useStreamLoader(id);
	const [currentTime, setCurrentTime] = useState("");
	const [expirationDate, setExpirationDate] = useState<string>("Unknown");

	useEffect(() => {
		if (!stream) return;

		const updateClock = () => {
			setCurrentTime(formatTime(stream.settings.hourFormat));
		};

		updateClock();

		const intervalId = setInterval(updateClock, 60000);
		return () => clearInterval(intervalId);
	}, [stream]);

	useEffect(() => {
		if (!stream) return;

		setExpirationDate(formatExpirationDate(stream.expDate));

		const controller = new AbortController();
		const refreshAccountInfo = async () => {
			const info = await apiService.fetchStreamInfo(stream, controller.signal);
			if (controller.signal.aborted) return;

			const expDate = info?.user_info?.exp_date ?? null;
			setExpirationDate(formatExpirationDate(expDate));

			if (id && expDate !== stream.expDate) {
				storageService.updateStream(id, { expDate });
			}
		};

		void refreshAccountInfo();

		return () => controller.abort();
	}, [id, stream]);

	if (!stream) {
		return <NotFound message="Stream not found" />;
	}

	const menuItems: MenuItem[] = [
		{
			title: "Live TV",
			description: "Watch channels by category",
			to: "tv",
			accent: "from-secondary-400/25 via-secondary-400/5 to-transparent",
			icon: TvIcon
		},
		{
			title: "Movies",
			description: "Browse the VOD catalog",
			to: "movies",
			accent: "from-sky-400/20 via-sky-400/5 to-transparent",
			icon: FilmIcon
		},
		{
			title: "Series",
			description: "Seasons and episodes",
			to: "series",
			accent: "from-amber-300/20 via-amber-300/5 to-transparent",
			icon: VideoCameraIcon
		}
	];

	return (
		<div className="relative min-h-screen overflow-hidden bg-dark text-secondary">
			<div className="pointer-events-none absolute inset-0">
				<div className="absolute -top-32 right-1/4 h-[32rem] w-[32rem] rounded-full bg-secondary-400/10 blur-3xl" />
				<div className="absolute -bottom-20 left-0 h-80 w-80 rounded-full bg-primary/20 blur-3xl" />
			</div>

			<div className="fade-in relative mx-auto flex min-h-screen max-w-7xl flex-col px-6 py-7">
				<header className="flex flex-col gap-5 border-b border-white/10 pb-6 md:flex-row md:items-center md:justify-between">
					<div className="min-w-0">
						<p className="text-xs font-semibold uppercase tracking-widest text-secondary-700">OpenIPTV</p>
						<h1 className="mt-1 truncate text-3xl font-bold text-white">
							Hey <span className="text-secondary-400">{stream.name}</span>
						</h1>
					</div>

					<nav className="flex flex-wrap items-center gap-3">
						<div className="flex flex-col items-end leading-tight">
							<span className="text-2xl font-bold tabular-nums text-white">{currentTime}</span>
							<span className="text-xs font-medium capitalize text-secondary-700">{formatDate()}</span>
						</div>
						<Link
							to="settings"
							className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-bold text-secondary backdrop-blur transition hover:border-secondary-400/50 hover:bg-secondary-400 hover:text-dark"
						>
							<Cog6ToothIcon className="h-5 w-5" />
							Settings
						</Link>
					</nav>
				</header>

				<main className="grid flex-1 gap-6 py-8 lg:grid-cols-[1fr_320px]">
					<section className="grid auto-rows-fr gap-4 md:grid-cols-3">
						{menuItems.map(({ title, description, to, accent, icon: Icon }) => (
							<Link
								key={to}
								to={to}
								className="group relative flex min-h-80 flex-col justify-between overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-6 transition duration-200 hover:-translate-y-1 hover:border-secondary-400/40 hover:shadow-2xl hover:shadow-black/40 focus:outline-none focus:ring-2 focus:ring-secondary-400"
							>
								<div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${accent} opacity-80 transition group-hover:opacity-100`} />
								<span className="relative inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-black/30 text-white ring-1 ring-white/10 transition group-hover:bg-secondary-400 group-hover:text-dark">
									<Icon className="h-8 w-8" />
								</span>
								<span className="relative">
									<span className="block text-3xl font-bold text-white">{title}</span>
									<span className="mt-2 flex items-center gap-1 text-sm text-secondary-800">
										{description}
										<ArrowRightIcon className="h-4 w-4 -translate-x-1 opacity-0 transition group-hover:translate-x-0 group-hover:opacity-100" />
									</span>
								</span>
							</Link>
						))}
					</section>

					<aside className="flex flex-col gap-4">
						<div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur">
							<div className="flex items-center gap-3">
								<UserCircleIcon className="h-9 w-9 text-secondary-400" />
								<div className="min-w-0">
									<p className="text-xs font-semibold uppercase tracking-wide text-secondary-700">Connected as</p>
									<p className="truncate text-lg font-bold text-white">{stream.username}</p>
								</div>
							</div>
						</div>

						<div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur">
							<div className="flex items-center gap-3">
								<CalendarDaysIcon className="h-8 w-8 text-secondary-400" />
								<div>
									<p className="text-xs font-semibold uppercase tracking-wide text-secondary-700">Subscription ends</p>
									<p className="text-lg font-bold text-white">{expirationDate}</p>
								</div>
							</div>
						</div>

						<Link
							to="favourites"
							className="group rounded-2xl border border-white/10 bg-gradient-to-br from-secondary-400/15 to-transparent p-5 backdrop-blur transition hover:border-secondary-400/50 hover:from-secondary-400/25 focus:outline-none focus:ring-2 focus:ring-secondary-400"
						>
							<div className="flex items-center gap-3">
								<span className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary-400/15 text-secondary-400 transition group-hover:bg-secondary-400 group-hover:text-dark">
									<HeartIcon className="h-6 w-6" />
								</span>
								<div>
									<p className="text-xs font-semibold uppercase tracking-wide text-secondary-700">Favourites</p>
									<p className="text-lg font-bold text-white">Movies &amp; series</p>
								</div>
							</div>
						</Link>

						<Link
							to="/"
							className="mt-auto inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-secondary transition hover:border-secondary-400/50 hover:bg-secondary-400 hover:text-dark"
						>
							<ArrowLeftIcon className="h-5 w-5" />
							Back to profiles
						</Link>
					</aside>
				</main>
			</div>
		</div>
	);
}
