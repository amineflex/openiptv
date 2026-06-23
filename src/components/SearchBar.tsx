import { MagnifyingGlassIcon, XMarkIcon } from "@heroicons/react/24/outline";

interface SearchBarProps {
	value: string;
	onChange: (value: string) => void;
	onClear: () => void;
	placeholder?: string;
	resultCount?: number;
	totalCount?: number;
}

export default function SearchBar({ value, onChange, onClear, placeholder = "Search", resultCount, totalCount }: SearchBarProps) {
	return (
		<div className="mb-5">
			<div className="relative">
				<MagnifyingGlassIcon className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-secondary-700" />
				<input
					type="text"
					value={value}
					onChange={(e) => onChange(e.target.value)}
					placeholder={placeholder}
					className="w-full rounded-xl border border-white/10 bg-white/5 py-3 pl-11 pr-11 text-secondary outline-none transition placeholder:text-secondary-700/60 focus:border-secondary-400 focus:bg-white/10"
				/>
				{value && (
					<button
						type="button"
						onClick={onClear}
						className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-secondary-700 transition hover:bg-white/10 hover:text-white"
					>
						<XMarkIcon className="h-5 w-5" />
					</button>
				)}
			</div>
			{value && resultCount !== undefined && totalCount !== undefined && (
				<p className="mt-2 text-xs text-secondary-700">
					<span className="font-semibold text-secondary-400">{resultCount}</span> result{resultCount !== 1 ? "s" : ""} of {totalCount}
				</p>
			)}
		</div>
	);
}
