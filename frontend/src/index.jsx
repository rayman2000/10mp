import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  // StrictMode disabled because it causes double-mounting in development,
  // which conflicts with EmulatorJS initialization (causes script redeclaration errors)
  <App />
);