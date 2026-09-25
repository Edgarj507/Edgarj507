import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { AuthProvider } from './auth/AuthContext';
import { PrefsProvider } from './i18n/prefs';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PrefsProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </PrefsProvider>
  </StrictMode>,
);
