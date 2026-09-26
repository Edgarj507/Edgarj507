import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { AuthProvider } from './auth/AuthContext';
import { RoleProvider } from './auth/RoleContext';
import { PrefsProvider } from './i18n/prefs';
import { CourseLibraryProvider } from './courses/CourseLibrary';
import './index.css';
import { installErrorCapture } from './support/diagnostics';
import { installHaptics } from './lib/haptics';

installErrorCapture();
installHaptics();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PrefsProvider>
      <AuthProvider>
        <RoleProvider>
          <CourseLibraryProvider>
            <App />
          </CourseLibraryProvider>
        </RoleProvider>
      </AuthProvider>
    </PrefsProvider>
  </StrictMode>,
);
