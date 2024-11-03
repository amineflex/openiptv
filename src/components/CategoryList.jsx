import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';

export default function CategoryList({ categories, selectedCategory, handleCategorySelect, title, backLink }) {
    return (
        <aside className="md:w-1/5 w-1/3 bg-primary/20 rounded-r-xl text-dark-900 h-screen overflow-y-scroll px-5 py-5">
            {/* Back to Menu Link */}
            <Link to={backLink} className="text-secondary/75 text-sm font-semibold inline-flex items-center rounded-xl bg-primary/10 hover:bg-primary-100 w-full py-0.5 px-2 my-1">
                <ArrowLeftIcon className="h-4 w-4 mr-2 text-secondary-400 " />
                <span>Back to Menu</span>
            </Link>

            <h1 className="text-3xl text-center font-bold mb-4">{title}</h1>

            {/* All Channels Option */}
            <div
                onClick={() => handleCategorySelect({ category_id: "all", category_name: "All Channels" })}
                className={`my-2 p-2 rounded-xl truncate cursor-pointer ${selectedCategory?.category_id === "all" ? 'border-2 border-secondary-400 bg-dark' : 'bg-dark'}`}
            >
                <h2 className="text-md font-semibold">All Channels</h2>
            </div>

            {/* Dynamic Categories */}
            {categories.map((category) => (
                <div
                    key={category.id}
                    onClick={() => handleCategorySelect(category)}
                    className={`my-2 p-2 rounded-xl truncate cursor-pointer ${selectedCategory?.category_id === category.category_id ? 'border-2 border-secondary-400 bg-dark' : 'bg-dark'}`}
                >
                    <h2 className="text-md font-semibold">{category.category_name}</h2>
                </div>
            ))}
        </aside>
    );
}
