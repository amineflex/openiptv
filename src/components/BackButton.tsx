import { Link, useNavigate } from "react-router-dom";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";

interface BackButtonProps {
	/** Navigate to this route. When omitted, goes back one step in history. */
	to?: string;
	label?: string;
}

/**
 * Back button anchored to the top-left of the viewport. Being `fixed`, it
 * stays reachable while the page scrolls, and keeps a consistent look/position
 * across every full-page view.
 */
export default function BackButton({ to, label = "Back" }: BackButtonProps) {
	const navigate = useNavigate();
	const className =
		"fixed left-4 top-4 z-50 inline-flex items-center justify-center rounded-full bg-dark/60 p-2.5 text-secondary-400 shadow-lg shadow-black/30 backdrop-blur transition hover:bg-secondary-400 hover:text-dark";

	if (to) {
		return (
			<Link to={to} className={className} aria-label={label}>
				<ArrowLeftIcon className="h-5 w-5" />
			</Link>
		);
	}

	return (
		<button type="button" onClick={() => navigate(-1)} className={className} aria-label={label}>
			<ArrowLeftIcon className="h-5 w-5" />
		</button>
	);
}
