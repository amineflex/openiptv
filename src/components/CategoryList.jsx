import React from "react";
import { Link } from "react-router-dom";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";

export default function CategoryList({ categories, selectedCategory, handleCategorySelect, title, backLink }) {
	return (
		<aside className="md:w-1/5 w-1/3 bg-primary/20 rounded-r-xl text-dark-900 h-screen overflow-y-scroll px-5 py-5">
			{/* Back to Menu Link */}

			<header className="flex flex-row items-center mb-4 gap-2">
				<Link
					to={backLink}
					className="text-secondary/75 text-sm font-semibold items-center rounded-full bg-primary/10 hover:bg-primary-100 p-2"
				>
					<ArrowLeftIcon className="h-4 w-4 text-secondary-400 " />
				</Link>
				<h1 className="text-3xl text-center font-bold">{title}</h1>
			</header>

			{/* All Channels Option */}
			<div
				onClick={() => handleCategorySelect({ category_id: "all", category_name: "All Channels" })}
				className={`my-2 p-2 rounded-xl truncate cursor-pointer ${selectedCategory?.category_id === "all" ? "border-2 border-secondary-400 bg-dark" : "bg-dark"}`}
			>
				<h2 className="text-md font-semibold">All Channels</h2>
			</div>

			{/* Dynamic Categories */}
			{categories.map((category) => (
				<div
					key={category.id}
					onClick={() => handleCategorySelect(category)}
					className={`my-2 p-2 rounded-xl truncate cursor-pointer ${selectedCategory?.category_id === category.category_id ? "border-2 border-secondary-400 bg-dark" : "bg-dark"}`}
				>
					<h2 className="text-md font-semibold">{category.category_name}</h2>
				</div>
			))}
		</aside>
	);
}
