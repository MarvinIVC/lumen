'use client';

import { useEffect } from 'react';

/**
 * PWA groundwork (phase-00 §12). The worker is registered but caches nothing yet — offline
 * strategy lands in phase-09. Registering now means the install prompt and the update flow are
 * already wired when caching arrives.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
        // A failed registration must never break the app.
      });
    };

    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
  }, []);

  return null;
}
