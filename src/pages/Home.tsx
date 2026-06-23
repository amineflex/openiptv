import AddStream from "../components/AddStream";

export default function Home() {
	return (
		<div className="relative min-h-screen overflow-hidden bg-dark text-secondary">
			{/* Ambient background glow */}
			<div className="pointer-events-none absolute inset-0">
				<div className="absolute -top-40 left-1/2 h-[36rem] w-[36rem] -translate-x-1/2 rounded-full bg-secondary-400/10 blur-3xl" />
				<div className="absolute bottom-0 right-0 h-96 w-96 rounded-full bg-primary/20 blur-3xl" />
			</div>

			<div className="fade-in relative mx-auto flex min-h-screen max-w-6xl flex-col items-center justify-center px-6 py-16">
				<header className="mb-12 flex flex-col items-center text-center">
		
					<h1 className="text-5xl font-bold tracking-tight text-white">
						Open<span className="text-secondary-400">IPTV</span>
					</h1>
					<p className="mt-3 text-base text-secondary-700">
						Select a profile to start watching, or add a new stream
					</p>
				</header>

				<div className="grid w-full grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
					<AddStream />
				</div>
			</div>
		</div>
	);
}
