import React from 'react';
import { HashRouter as Router, Routes, Route } from "react-router-dom";


// Pages
import Home from './pages/Home';
import Menu from './pages/Menu';
import LiveTv from './pages/LiveTv';
import Player from './pages/Player';


export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/menu/:id" element={<Menu />} />
        <Route path="/menu/:id/tv" element={<LiveTv />} />

        <Route path="/player" element={<Player />} />

      </Routes>
    </Router>
  );
}

