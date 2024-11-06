import React from "react";
import { HashRouter as Router, Routes, Route } from "react-router-dom";

// Pages
import Home from "./pages/Home";
import Menu from "./pages/Menu";
import LiveTv from "./pages/LiveTv";
import Movies from "./pages/Movies";
import Movie from "./pages/Movie";
import Watch from "./pages/Watch";
import Settings from "./pages/Settings";

export default function App() {
	return (
		<Router>
			<Routes>
				<Route path="/" element={<Home />} />
				<Route path="/menu/:id" element={<Menu />} />
				<Route path="/menu/:id/settings" element={<Settings/>} />
				<Route path="/menu/:id/tv" element={<LiveTv />} />
				<Route path="/menu/:id/movies" element={<Movies />} />
				<Route path="/menu/:id/movies/v/:movieId" element={<Movie />} />



				<Route path="/watch" element={<Watch />} />
			</Routes>
		</Router>
	);
}
