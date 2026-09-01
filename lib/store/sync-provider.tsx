'use client';

import { createContext, useContext, useEffect, useState } from 'react';

import { useAuth } from '@/lib/auth/auth-provider';
import { mergeAndStart, startSync } from './sync';

type SyncStatus = 'local' | 'merging' | 'synced' | 'offline';
const SyncContext = createContext<SyncStatus>('local');

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [status, setStatus] = useState<SyncStatus>('local');

  useEffect(() => {
    if (!user) {
      setStatus('local');
      return;
    }
    let active = true;
    setStatus(navigator.onLine ? 'merging' : 'offline');
    void mergeAndStart(user.id).then(() => {
      if (active) setStatus(navigator.onLine ? 'synced' : 'offline');
    });
    const stop = startSync(user.id);
    const online = () => setStatus('synced');
    const offline = () => setStatus('offline');
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    return () => {
      active = false;
      stop();
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
    };
  }, [user]);

  return <SyncContext.Provider value={status}>{children}</SyncContext.Provider>;
}

export function useSyncStatus(): SyncStatus {
  return useContext(SyncContext);
}
