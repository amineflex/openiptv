import React from 'react';
import { useParams, Link } from "react-router-dom";
import { useStreamLoader } from "../hooks/useStreamLoader";


export default function Settings(){
    const { id } = useParams();
	const stream = useStreamLoader(id);
    
    return(
        <div className='bg-dark text-secondary'>
            <div className='max-w-5xl flex justify-center min-h-screen'>
                <div className='flex flex-col'>
                    <Link to={`/menu/${id}`} >Back to home</Link>
                    <div>
                        <span>Domain : -</span>
                        <span>Username : </span>
                        <span>Password :  </span>
                        <span>Expiration Date : </span>

                    </div>
                </div>
            </div>
        </div>
    )
}