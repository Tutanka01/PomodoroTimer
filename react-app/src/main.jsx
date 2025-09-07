import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import './main.css';
import App from './modules/App.jsx';
import { LoginPage } from './modules/Login.jsx';
import { useTheme } from './modules/useTheme.js';

function RootRouter(){
	const { isDark, toggleTheme } = useTheme();
	const nav = useNavigate();
	return (
		<Routes>
			<Route path="/" element={<App />} />
			<Route path="/login" element={<LoginPage isDark={isDark} toggleTheme={toggleTheme} redirectHome={()=>nav('/')} />} />
		</Routes>
	);
}

createRoot(document.getElementById('root')).render(
	<BrowserRouter>
		<RootRouter />
	</BrowserRouter>
);
