import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { GoogleOAuthProvider } from '@react-oauth/google';

const savedTheme = localStorage.getItem('theme') || 'dark';
document.documentElement.setAttribute('data-theme', savedTheme);
document.documentElement.classList.add(savedTheme);

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <GoogleOAuthProvider clientId="16153526755-g4j2oofqb98fgg4h5rrkk8nlim9dq9nb.apps.googleusercontent.com">
      <App />
    </GoogleOAuthProvider>
  </React.StrictMode>
);