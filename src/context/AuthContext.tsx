import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../lib/config';
import { supabase } from '../lib/supabase';
import type { Profile } from '../types';

export type SocialProvider = 'google' | 'apple';

type AuthState = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<string | null>;
  /** Returns { error } or { needsConfirm: true } when the email must be confirmed first. */
  signUp: (email: string, password: string) => Promise<{ error?: string; needsConfirm?: boolean }>;
  /** Opens Google or Apple sign-in in the browser. Returns an error message, or null when the browser was opened. */
  signInWithProvider: (provider: SocialProvider) => Promise<string | null>;
  signOut: () => Promise<void>;
  /** Returns an error message, or null when saved. */
  updateProfile: (patch: Partial<Omit<Profile, 'id'>>) => Promise<string | null>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => sub.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id;

  useEffect(() => {
    if (!userId) {
      setProfile(null);
      return;
    }
    let cancelled = false;
    (async () => {
      let { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
      if (!data) {
        const res = await supabase.from('profiles').upsert({ id: userId }).select('*').single();
        data = res.data;
      }
      if (!cancelled && data) setProfile(data as Profile);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    return error ? error.message : null;
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
    if (error) return { error: error.message };
    if (!data.session) return { needsConfirm: true };
    return {};
  }, []);

  const signInWithProvider = useCallback(async (provider: SocialProvider) => {
    const name = provider === 'google' ? 'Google' : 'Apple';
    try {
      // Ask Supabase which sign-in methods are switched on, so we can explain instead of showing a raw error page.
      const res = await fetch(`${SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: SUPABASE_ANON_KEY } });
      if (res.ok) {
        const settings = (await res.json()) as { external?: Record<string, boolean> };
        if (settings.external && settings.external[provider] !== true) {
          return `${name} sign-in is not switched on yet. In Supabase: Authentication, Sign In / Providers, turn on ${name}.`;
        }
      }
      const redirectTo = Linking.createURL('auth-callback');
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo, skipBrowserRedirect: true },
      });
      if (error || !data.url) return error?.message ?? `Could not start ${name} sign-in.`;
      await Linking.openURL(data.url);
      return null;
    } catch {
      return `Could not start ${name} sign-in. Check your connection and try again.`;
    }
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const updateProfile = useCallback(
    async (patch: Partial<Omit<Profile, 'id'>>) => {
      if (!userId) return 'Not signed in.';
      setProfile((p) => (p ? { ...p, ...patch } : p));
      const { error } = await supabase.from('profiles').update(patch).eq('id', userId);
      return error ? error.message : null;
    },
    [userId],
  );

  const value = useMemo<AuthState>(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      loading,
      signIn,
      signUp,
      signInWithProvider,
      signOut,
      updateProfile,
    }),
    [session, profile, loading, signIn, signUp, signInWithProvider, signOut, updateProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
