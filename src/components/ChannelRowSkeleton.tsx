export default function ChannelRowSkeleton() {
	return (
		<div className="flex min-h-[112px] animate-pulse items-center gap-4 rounded-xl border border-white/10 bg-primary/10 p-4">
			<div className="h-16 w-16 flex-none rounded-xl bg-white/5" />
			<div className="min-w-0 flex-1">
				<div className="mb-2 h-4 w-16 rounded-full bg-white/5" />
				<div className="h-4 w-3/4 rounded bg-white/5" />
			</div>
		</div>
	);
}
