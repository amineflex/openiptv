import React from "react";
import { Link } from 'react-router-dom';

import AddStream from "../components/AddStream";

 

export default function Home() {
    return (
        <div className="bg-dark text-secondary min-h-screen flex items-center">
            <div className="mx-auto max-w-6xl">
                <h1 className="text-5xl">Welcome to OpenIPTV</h1>
                <p className="text-primary-700 mt-4 text-center">Select your IPTV Stream or add one</p>
                <Link to="/player" className="bg-primary/50 text-primary-700 rounded-xl px-4 py-2 mt-4 inline-block">Go to Player</Link>

                <div className="grid grid-cols-2 mt-10 gap-4 justify-stretch">


                    <AddStream />


                </div>


            </div>
        </div>
    )
}