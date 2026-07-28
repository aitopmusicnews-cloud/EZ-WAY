import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { MediaStoreProvider } from './context/MediaStoreContext';
import { AudioProvider } from './context/AudioContext';

// Handle Vite dynamic chunk loading errors gracefully
if (typeof window !== 'undefined') {
  const isChunkError = (str: string) => {
    const s = String(str).toLowerCase();
    return (
      s.includes('failed to fetch dynamically imported module') ||
      s.includes('error loading dynamically imported module') ||
      s.includes('chunkloaderror') ||
      s.includes('dynamic import failed')
    ) || false;
  };

  window.addEventListener('error', (e) => {
    const errorMsg = e.message || (e.error && e.error.message) || '';
    if (isChunkError(errorMsg)) {
      console.warn('Vite ChunkLoadError intercepted. Reloading latest bundle...');
      window.location.reload();
    }
  }, true);

  window.addEventListener('unhandledrejection', (e) => {
    const reasonMsg = e.reason ? (e.reason.message || e.reason.stack || String(e.reason)) : '';
    if (isChunkError(reasonMsg)) {
      console.warn('Vite ChunkLoadError unhandled rejection intercepted. Reloading latest bundle...');
      window.location.reload();
    }
  });
}

const container = document.getElementById('root');

if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <MediaStoreProvider>
        <AudioProvider>
          <App />
        </AudioProvider>
      </MediaStoreProvider>
    </React.StrictMode>
  );
}
