import { Link } from "react-router-dom";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";
import type { Category } from "../types";

interface CategoryListProps {
	categories: Category[];
	selectedCategory: Category | null;
	handleCategorySelect: (category: Category) => void;
	title: string;
	backLink: string;
}

export default function CategoryList({ categories, selectedCategory, handleCategorySelect, title, backLink }: CategoryListProps) {
	const renderItem = (category: Category, label: string) => {
		const isActive = selectedCategory?.category_id === category.category_id;
		return (
			<button
				key={category.category_id}
				type="button"
				onClick={() => handleCategorySelect(category)}
				className={`w-full rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition ${
					isActive
						? "bg-secondary-400 text-dark shadow-lg shadow-secondary-400/20"
						: "text-secondary-800 hover:bg-white/5 hover:text-white"
				}`}
			>
				<span className="truncate">{label}</span>
			</button>
		);
	};

	return (
		<aside className="flex h-screen w-56 flex-none flex-col border-r border-white/10 bg-white/[0.02] md:w-64 2xl:w-80">
			<header className="flex items-center gap-3 border-b border-white/10 px-4 py-5">
				<Link
					to={backLink}
					className="rounded-full bg-white/5 p-2 text-secondary-400 transition hover:bg-secondary-400 hover:text-dark"
				>
					<ArrowLeftIcon className="h-5 w-5" />
				</Link>
				<h1 className="text-2xl font-bold text-white">{title}</h1>
			</header>

			<div className="flex flex-col gap-1 overflow-y-auto px-3 py-4">
				{renderItem({ category_id: "all", category_name: "All Channels" }, "All Channels")}
				{categories.map((category) => renderItem(category, category.category_name))}
			</div>
		</aside>
	);
}
