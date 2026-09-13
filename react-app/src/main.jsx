import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import './main.css';
import App from './modules/App.jsx';
import { LoginPage } from './modules/Login.jsx';
import { DashboardPage } from './modules/Dashboard.jsx';
import { useTheme } from './modules/useTheme.js';

// Une seule instance de thème pour tout le routeur, transmise aux pages (pas de désynchronisation).
function RootRouter(){
	const { isDark, toggleTheme } = useTheme();
	const nav = useNavigate();
	return (
		<Routes>
			<Route path="/" element={<App isDark={isDark} toggleTheme={toggleTheme} />} />
			<Route path="/login" element={<LoginPage isDark={isDark} toggleTheme={toggleTheme} redirectHome={()=>nav('/')} />} />
			<Route path="/dashboard" element={<DashboardPage isDark={isDark} toggleTheme={toggleTheme} />} />
		</Routes>
	);
}

createRoot(document.getElementById('root')).render(
	<BrowserRouter>
		<RootRouter />
	</BrowserRouter>
);
