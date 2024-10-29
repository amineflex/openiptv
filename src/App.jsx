import React from 'react';
import { HashRouter as Router, Routes, Route } from "react-router-dom";


// Pages
import Home from './pages/Home';
import Settings from './pages/Settings';

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </Router>
  );
}

