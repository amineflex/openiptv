import { useState, useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import {
	ArrowDownTrayIcon,
	ArrowLeftIcon,
	ArrowRightIcon,
	ClockIcon,
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
	return new Intl.DateTimeFormat(("en-US"), {
		hour: "2-digit",
		minute: "2-digit",
		hour12: hourFormat === "12H"
	}).format(new Date());
}

function formatDate(): string {
	return new Intl.DateTimeFormat(("en-US"), {
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

	return new Intl.DateTimeFormat(("en-US"), {
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

	// Sidebar quick-links — one template renders all three, so they stay uniform
	// by construction. Only the per-accent colour classes differ (kept as full
	// literal strings so Tailwind picks them up).
	const sideLinks: {
		to: string;
		label: string;
		value: string;
		icon: typeof TvIcon;
		card: string;
		chip: string;
	}[] = [
		{
			to: "favourites",
			label: "Favourites",
			value: "Movies & series",
			icon: HeartIcon,
			card: "from-secondary-400/15 hover:border-secondary-400/50 hover:from-secondary-400/25 focus:ring-secondary-400",
			chip: "bg-secondary-400/15 text-secondary-400 group-hover:bg-secondary-400 group-hover:text-dark"
		},
		{
			to: "history",
			label: "History",
			value: "Recently watched",
			icon: ClockIcon,
			card: "from-sky-400/15 hover:border-sky-400/50 hover:from-sky-400/25 focus:ring-sky-400",
			chip: "bg-sky-400/15 text-sky-300 group-hover:bg-sky-400 group-hover:text-dark"
		},
		{
			to: "downloads",
			label: "Downloads",
			value: "Watch offline",
			icon: ArrowDownTrayIcon,
			card: "from-emerald-400/15 hover:border-emerald-400/50 hover:from-emerald-400/25 focus:ring-emerald-400",
			chip: "bg-emerald-400/15 text-emerald-300 group-hover:bg-emerald-400 group-hover:text-dark"
		}
	];

	return (
		<div className="relative min-h-screen overflow-hidden bg-dark text-secondary">
			{/* Ambient blobs — scaled up on large screens */}
			<div className="pointer-events-none absolute inset-0">
				<div className="absolute -top-32 right-1/4 h-[32rem] w-[32rem] rounded-full bg-secondary-400/10 blur-3xl animate-pulse-slow 2xl:h-[52rem] 2xl:w-[52rem]" />
				<div className="absolute -bottom-20 left-0 h-80 w-80 rounded-full bg-primary/20 blur-3xl animate-pulse-slow 2xl:h-[30rem] 2xl:w-[30rem]" style={{ animationDelay: "2s" }} />
			</div>

			{/* Content — wider container on 2K/4K */}
			<div className="fade-in relative mx-auto flex min-h-screen max-w-7xl flex-col px-6 py-7 2xl:max-w-[112rem] 2xl:px-12 min-[2560px]:max-w-[160rem] min-[2560px]:px-16">

				<header className="flex flex-col gap-5 border-b border-white/10 pb-6 md:flex-row md:items-center md:justify-between">
					<div className="min-w-0">
						<p className="text-xs font-semibold uppercase tracking-widest text-secondary-700">OpenIPTV</p>
						<h1 className="mt-1 truncate text-3xl font-bold text-white 2xl:text-4xl">
							Hey <span className="text-secondary-400">{stream.name}</span>
						</h1>
					</div>

					<nav className="flex flex-wrap items-center gap-3">
						<div className="flex flex-col items-end leading-tight">
							<span className="text-2xl font-bold tabular-nums text-white 2xl:text-3xl">{currentTime}</span>
							<span className="text-xs font-medium capitalize text-secondary-700">{formatDate()}</span>
						</div>
						<Link
							to="settings"
							className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-bold text-secondary backdrop-blur transition hover:border-secondary-400/50 hover:bg-secondary-400 hover:text-dark 2xl:px-5 2xl:py-3 2xl:text-base"
						>
							<Cog6ToothIcon className="h-5 w-5" />
							Settings
						</Link>
					</nav>
				</header>

				{/*
					Main layout:
					  - Default / lg:  [cards section | sidebar 320px]
					  - 2xl (1536px+): [cards section | sidebar 460px]

					Cards section:
					  - md:  3 equal columns (Live TV | Movies | Series)
					  - 2xl: 2 columns, 2 rows — Live TV spans both rows on the left;
					         Movies (row 1) and Series (row 2) stack on the right
				*/}
				<main className="grid flex-1 gap-6 py-8 lg:grid-cols-[1fr_320px] 2xl:grid-cols-[1fr_460px] min-[2560px]:grid-cols-[1fr_600px] min-[2560px]:gap-10">

					<section className="grid auto-rows-fr gap-4 md:grid-cols-3 2xl:grid-cols-2 2xl:grid-rows-2">
						{menuItems.map(({ title, description, to, accent, icon: Icon }, index) => (
							<Link
								key={to}
								to={to}
								className={[
									"glass group relative flex flex-col justify-between overflow-hidden rounded-2xl p-6 transition-all duration-300",
									"hover:-translate-y-2 hover:border-secondary-400/60 hover:shadow-2xl hover:shadow-secondary-400/20",
									"focus:outline-none focus:ring-2 focus:ring-secondary-400",
									"min-h-80 2xl:min-h-0",
									// On 2xl: Live TV spans both rows in the left column
									index === 0 ? "2xl:row-span-2" : "",
									"2xl:p-8"
								].join(" ")}
							>
								<div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${accent} opacity-80 transition group-hover:opacity-100`} />

								<span className="relative inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-black/30 text-white ring-1 ring-white/10 transition group-hover:bg-secondary-400 group-hover:text-dark 2xl:h-16 2xl:w-16">
									<Icon className="h-8 w-8 2xl:h-9 2xl:w-9" />
								</span>

								<span className="relative">
									<span className="block text-3xl font-bold text-white 2xl:text-4xl">{title}</span>
									<span className="mt-2 flex items-center gap-1 text-sm text-secondary-800 2xl:text-base">
										{description}
										<ArrowRightIcon className="h-4 w-4 -translate-x-1 opacity-0 transition group-hover:translate-x-0 group-hover:opacity-100" />
									</span>
								</span>
							</Link>
						))}
					</section>

					<aside className="flex flex-col gap-4 2xl:gap-5">
						<Link
							to="account"
							className="glass group rounded-2xl p-6 transition hover:border-secondary-400/50 hover:bg-secondary-400/10 focus:outline-none focus:ring-2 focus:ring-secondary-400 2xl:p-7 min-[2560px]:p-9"
						>
							<div className="flex items-center gap-3">
								<UserCircleIcon className="h-9 w-9 flex-none text-secondary-400 transition group-hover:text-secondary 2xl:h-11 2xl:w-11 min-[2560px]:h-14 min-[2560px]:w-14" />
								<div className="min-w-0">
									<p className="text-xs font-semibold uppercase tracking-wide text-secondary-700 min-[2560px]:text-sm">Connected as</p>
									<p className="truncate text-lg font-bold text-white 2xl:text-xl min-[2560px]:text-2xl">{stream.username}</p>
								</div>
							</div>
							<div className="mt-4 flex items-center gap-3 border-t border-white/10 pt-4 min-[2560px]:mt-6 min-[2560px]:pt-6">
								<CalendarDaysIcon className="h-9 w-9 flex-none text-secondary-400 transition group-hover:text-secondary 2xl:h-11 2xl:w-11 min-[2560px]:h-14 min-[2560px]:w-14" />
								<div className="min-w-0">
									<p className="text-xs font-semibold uppercase tracking-wide text-secondary-700 min-[2560px]:text-sm">Subscription ends</p>
									<p className="truncate text-lg font-bold text-white 2xl:text-xl min-[2560px]:text-2xl">{expirationDate}</p>
								</div>
							</div>
						</Link>

						{sideLinks.map(({ to, label, value, icon: Icon, card, chip }) => (
							<Link
								key={to}
								to={to}
								className={`glass group flex items-center gap-3 rounded-2xl p-6 transition focus:outline-none focus:ring-2 2xl:gap-4 2xl:p-7 min-[2560px]:gap-5 min-[2560px]:p-9 ${card}`}
							>
								<span className={`flex h-11 w-11 flex-none items-center justify-center rounded-xl transition 2xl:h-12 2xl:w-12 min-[2560px]:h-16 min-[2560px]:w-16 ${chip}`}>
									<Icon className="h-6 w-6 2xl:h-7 2xl:w-7 min-[2560px]:h-9 min-[2560px]:w-9" />
								</span>
								<div className="min-w-0">
									<p className="text-xs font-semibold uppercase tracking-wide text-secondary-700 min-[2560px]:text-sm">{label}</p>
									<p className="truncate text-lg font-bold text-white 2xl:text-xl min-[2560px]:text-2xl">{value}</p>
								</div>
							</Link>
						))}

						<Link
							to="/"
							className="mt-auto inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-secondary transition hover:border-secondary-400/50 hover:bg-secondary-400 hover:text-dark 2xl:py-4 2xl:text-base min-[2560px]:py-5 min-[2560px]:text-lg"
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
