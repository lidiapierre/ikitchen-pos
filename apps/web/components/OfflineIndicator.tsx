'use client';

import { useEffect, useState } from 'react';

export default function OfflineIndicator() {
  const [offline, setOffline] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setOffline(!navigator.onLine);

    const handleOffline = () => {
      setOffline(true);
      setDismissed(false);
    };
    const handleOnline = () => {
      setOffline(false);
      setDismissed(false);
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  if (!offline || dismissed) return null;

  return (
    <div
      role="alert"
      className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-lg bg-yellow-500 px-4 py-2.5 text-sm font-medium text-slate-900 shadow-lg"
    >
      <span>⚠️ You&apos;re offline — some features may be unavailable</span>
      <button
        onClick={() => setDismissed(true)}
        aria-label="Dismiss offline notice"
        className="ml-1 rounded p-0.5 hover:bg-yellow-600 focus:outline-none focus:ring-2 focus:ring-yellow-700"
      >
        ✕
      </button>
    </div>
  );
}
