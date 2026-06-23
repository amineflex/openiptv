interface StarRatingProps {
	value?: string | number;
	scale?: number;
	size?: "sm" | "md" | "lg";
	showValue?: boolean;
}

export default function StarRating({ value, scale = 10, size = "sm", showValue = false }: StarRatingProps) {
	const numeric = parseFloat(String(value ?? 0));
	if (!Number.isFinite(numeric) || numeric <= 0) return null;

	const normalized = Math.max(0, Math.min(numeric / scale, 1));
	const stars = Math.round(normalized * 5);

	const sizeClass = size === "lg" ? "text-xl" : size === "md" ? "text-base" : "text-sm";

	return (
		<span className={`inline-flex items-center gap-1 ${sizeClass}`}>
			<span className="text-secondary-400">
				{"★".repeat(stars)}{"☆".repeat(5 - stars)}
			</span>
			{showValue && (
				<span className="text-secondary-700 text-xs">{numeric.toFixed(1)}/{scale}</span>
			)}
		</span>
	);
}
