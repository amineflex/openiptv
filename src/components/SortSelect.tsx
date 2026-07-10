import { Select } from "@headlessui/react";
import { ArrowsUpDownIcon, ChevronDownIcon } from "@heroicons/react/24/outline";
import type { SortMode, SortOption } from "../services/sortStreams";

interface SortSelectProps {
	value: SortMode;
	onChange: (value: SortMode) => void;
	options: SortOption[];
}

export default function SortSelect({ value, onChange, options }: SortSelectProps) {
	return (
		<div className="relative shrink-0">
			<ArrowsUpDownIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-secondary-700" />
			<Select
				value={value}
				onChange={(event) => onChange(event.target.value as SortMode)}
				aria-label="Sort"
				className="w-44 cursor-pointer appearance-none rounded-xl border border-white/10 bg-white/5 py-3 pl-9 pr-9 text-sm text-secondary outline-none transition hover:bg-white/10 focus:border-secondary-400 focus:bg-white/10"
			>
				{options.map((option) => (
					<option key={option.value} value={option.value} className="bg-gray-900 text-white">
						{option.label}
					</option>
				))}
			</Select>
			<ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-secondary-700" />
		</div>
	);
}
