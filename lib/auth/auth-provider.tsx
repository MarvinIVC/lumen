'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { SignInDialog } from './sign-in-dialog';
import type { SessionUser } from '@/lib/supabase/server.server';
import { reconcileAccountKey } from '@/lib/ai/byok-client';

interface AuthContextValue {
  user: SessionUser | null;
  loading: boolean;
  openSignIn: () => void;
  closeSignIn: () => void;
  refresh: () => Promise<SessionUser | null>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({
  initialUser,
  children,
}: {
  initialUser: SessionUser | null;
  children: React.ReactNode;
}) {
  const [user, setUser] = useState(initialUser);
  const [loading, setLoading] = useState(!initialUser);
  const [signInOpen, setSignInOpen] = useState(false);

  const refresh = useCallback(async (): Promise<SessionUser | null> => {
    try {
      const response = await fetch('/api/auth/session', { cache: 'no-store' });
      const result = (await response.json()) as { user?: SessionUser | null };
      const next = result.user ?? null;
      setUser(next);
      return next;
    } catch {
      return user;
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void refresh();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const channel = new BroadcastChannel('lumen-auth');
    channel.addEventListener('message', () => void refresh());
    return () => channel.close();
  }, [refresh]);

  useEffect(() => {
    if (user) void reconcileAccountKey();
  }, [user]);

  const signOut = useCallback(async () => {
    await fetch('/api/auth/signout', { method: 'POST' });
    setUser(null);
    new BroadcastChannel('lumen-auth').postMessage('changed');
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      openSignIn: () => setSignInOpen(true),
      closeSignIn: () => setSignInOpen(false),
      refresh,
      signOut,
    }),
    [loading, refresh, signOut, user],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
      <SignInDialog open={signInOpen} onOpenChange={setSignInOpen} />
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
