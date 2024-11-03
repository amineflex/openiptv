import React from 'react';

export default function LoadingSpinner() {
    return (
        <div className="h-full flex items-center justify-center">
            <p className="text-2xl text-center text-secondary-400 inline-flex justify-center items-center">
                <svg
                    fill="none"
                    className="w-10 h-10 mr-2 animate-spin"
                    viewBox="0 0 32 32"
                    xmlns="http://www.w3.org/2000/svg"
                >
                    <path
                        clipRule="evenodd"
                        d="M15.165 8.53a.5.5 0 01-.404.58A7 7 0 1023 16a.5.5 0 011 0 8 8 0 11-9.416-7.874.5.5 0 01.58.404z"
                        fill="currentColor"
                        fillRule="evenodd"
                    />
                </svg>
                <span>Loading...</span>
            </p>
        </div>
    );
}
