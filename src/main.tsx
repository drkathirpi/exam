import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { App } from './App';
import { AuthProvider } from '@/auth/AuthProvider';
import { queryClient } from '@/lib/queryClient';
import { env } from '@/lib/env';
import './index.css';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element #root not found');

// Friendly setup screen instead of a blank page when build-time config is absent.
function ConfigError() {
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
      <div style={{ maxWidth: 420, fontFamily: 'system-ui, sans-serif', color: '#16323F' }}>
        <h1 style={{ fontSize: 20, marginBottom: 8 }}>Configuration needed</h1>
        <p style={{ fontSize: 14, color: '#5C6F77', lineHeight: 1.5 }}>
          Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> in your
          environment, then rebuild. See <code>.env.example</code>.
        </p>
      </div>
    </div>
  );
}

createRoot(rootEl).render(
  <StrictMode>
    {env.isConfigured ? (
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <HashRouter>
            <App />
          </HashRouter>
        </AuthProvider>
      </QueryClientProvider>
    ) : (
      <ConfigError />
    )}
  </StrictMode>,
);
