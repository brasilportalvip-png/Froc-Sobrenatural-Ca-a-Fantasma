import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { AuthProvider } from './services/AuthContext.tsx';
import { ToolSessionProvider } from './services/ToolSessionContext.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <ToolSessionProvider>
        <App />
      </ToolSessionProvider>
    </AuthProvider>
  </StrictMode>,
);

