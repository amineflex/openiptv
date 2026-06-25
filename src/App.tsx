import { HashRouter as Router, Routes, Route } from "react-router-dom";

import Home from "./pages/Home";
import Menu from "./pages/Menu";
import LiveTv from "./pages/LiveTv";
import Movies from "./pages/Movies";
import Series from "./pages/Series";
import SeriesDetail from "./pages/SeriesDetail";
import Movie from "./pages/Movie";
import Watch from "./pages/Watch";
import Settings from "./pages/Settings";
import Favourites from "./pages/Favourites";
import AccountInfo from "./pages/AccountInfo";
import UpdateNotifier from "./components/UpdateNotifier";

export default function App() {
	return (
		<>
			<UpdateNotifier />
			<Router>
				<Routes>
					<Route path="/" element={<Home />} />
					<Route path="/menu/:id" element={<Menu />} />
					<Route path="/menu/:id/account" element={<AccountInfo />} />
					<Route path="/menu/:id/favourites" element={<Favourites />} />
					<Route path="/menu/:id/settings" element={<Settings />} />
					<Route path="/menu/:id/tv" element={<LiveTv />} />
					<Route path="/menu/:id/movies" element={<Movies />} />
					<Route path="/menu/:id/series" element={<Series />} />

					<Route path="/menu/:id/movies/v/:movieId" element={<Movie />} />
					<Route path="/menu/:id/series/v/:seriesId" element={<SeriesDetail />} />

					<Route path="/watch" element={<Watch />} />
				</Routes>
			</Router>
		</>
	);
}

