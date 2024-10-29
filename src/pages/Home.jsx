import React from "react";
import { Link } from 'react-router-dom';

import AddStream from "../components/AddStream";

import { TvIcon } from "@heroicons/react/24/outline";
 

export default function Home() {
    return (
        <div className="bg-dark text-secondary min-h-screen flex items-center">
            <div className="mx-auto max-w-6xl">
                <h1 className="text-5xl">Welcome to OpenIPTV</h1>
                <p className="text-primary-700 mt-4 text-center">Select your IPTV Stream or add one</p>

                <div className="grid grid-cols-2 mt-10 gap-4">

                    <button
                        type="button"
                        className="relative block w-full rounded-lg border-2 border-primary-700 p-10 text-center hover:border-primary focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 duration-300 group"
                        >

                        <TvIcon className="mx-auto h-12 w-12 text-secondary" />
                        <span className="mt-2 block text-sm font-semibold text-primary-800 group-hover:text-primary-700 duration-300">amine1337</span>
                        <span className="mt-2 block text-xs font-semibold text-dark-800 duration-300">iptv.aaa.xyz:8092</span>
                    </button>
                    <AddStream />
                    

                </div>


            </div>
        </div>
    )
}