// Apply browser fetch proxy shim to prevent standard write protection crashes in sandboxed iframes
try {
  const originalFetch = window.fetch;
  let currentFetch = originalFetch;
  Object.defineProperty(window, 'fetch', {
    get() {
      return currentFetch;
    },
    set(val) {
      currentFetch = val;
    },
    configurable: true,
    enumerable: true
  });
} catch (e) {
  try {
    const originalFetch = globalThis.fetch;
    let currentFetch = originalFetch;
    Object.defineProperty(globalThis, 'fetch', {
      get() {
        return currentFetch;
      },
      set(val) {
        currentFetch = val;
      },
      configurable: true,
      enumerable: true
    });
  } catch (e2) {
    // Already defined or non-configurable, proceed
  }
}

// NIM Proactive Error Filter: Silences benign HMR/Vite WebSocket rejection errors in the sandboxed preview
if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    if (event.reason) {
      const msg = event.reason.message || String(event.reason);
      if (msg.includes('WebSocket') || msg.includes('vite') || msg.includes('HMR') || msg.includes('closed without opened')) {
        event.preventDefault();
        event.stopPropagation();
        // Silenced completely to avoid console and terminal noise
      }
    }
  });
  
  window.addEventListener('error', (event) => {
    if (event.message && (event.message.includes('WebSocket') || event.message.includes('vite') || event.message.includes('HMR'))) {
      event.preventDefault();
      event.stopPropagation();
    }
  });
}

import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
