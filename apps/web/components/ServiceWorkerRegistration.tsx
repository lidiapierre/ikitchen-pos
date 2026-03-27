'use client';

import { useEffect } from 'react';

export default function ServiceWorkerRegistration() {
  useEffect(() => {
    const swEnabled =
      process.env.NODE_ENV === 'production' ||
      process.env.NEXT_PUBLIC_SW_ENABLED === 'true';

    if (swEnabled && 'serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .then((reg) => {
          console.log('[SW] Registered, scope:', reg.scope);
        })
        .catch((err) => {
          console.error('[SW] Registration failed:', err);
        });
    }
  }, []);

  return null;
}
