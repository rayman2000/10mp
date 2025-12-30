import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './index.css';
import App from './App';
import StatisticsPage from './pages/StatisticsPage';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  // StrictMode disabled because it causes double-mounting in development,
  // which conflicts with EmulatorJS initialization (causes script redeclaration errors)
  <BrowserRouter>
    <Routes>
      <Route path="/" element={<App />} />
      <Route path="/statistics" element={<StatisticsPage />} />
    </Routes>
  </BrowserRouter>
);