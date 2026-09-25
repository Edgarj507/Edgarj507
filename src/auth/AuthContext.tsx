import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Provider, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { EMAIL_RE, passwordProblem, sanitizeText, normalizeHandle } from '../../supabase/functions/_shared/validation.ts';

export type Visibility = 'public' | 'friends' | 'private';

export interface Profile {
  handle: string;
  display_name: string;
  handicap: number | null;
  handicap_visibility: Visibility;
  stats_visibility: Visibility;
}

type Status = 'loading' | 'signedOut' | 'signedIn' | 'guest';

interface AuthValue {
  status: Status;
  user: User | null;
  profile: Profile;
  cloud: boolean;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (email: string, password: string, handle: string) => Promise<string | null>;
  signInWithProvider: (p: Extract<Provider, 'google' | 'apple'>) => Promise<string | null>;
  continueAsGuest: () => void;
  signOut: () => Promise<void>;
  saveProfile: (p: Partial<Profile>) => Promise<string | null>;
}

const GUEST_PROFILE: Profile = {
  handle: 'guest', display_name: 'Guest', handicap: null, handicap_visibility: 'private', stats_visibility: 'private',
};
const GUEST_KEY = 'eg.guest.profile.v1';

const Ctx = createContext<AuthValue | null>(null);

// Auth errors are shown to users; keep them generic so they don't reveal whether an email exists.
const friendly = (msg: string) =>
  /invalid login|credentials/i.test(msg) ? 'Email or password is incorrect.'
  : /rate|too many/i.test(msg) ? 'Too many attempts. Try again in a minute.'
  : /already registered/i.test(msg) ? 'Check your email to continue.'
  : 'Something went wrong. Please try again.';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>(supabase ? 'loading' : 'signedOut');
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile>(() => {
    try { return { ...GUEST_PROFILE, ...JSON.parse(localStorage.getItem(GUEST_KEY) ?? '{}') }; } catch { return GUEST_PROFILE; }
  });

  const loadProfile = useCallback(async (uid: string) => {
    if (!supabase) return;
    const { data } = await supabase
      .from('profiles')
      .select('handle, display_name, handicap, handicap_visibility, stats_visibility')
      .eq('id', uid)
      .single();
    if (data) setProfile({ ...data, handicap: data.handicap == null ? null : Number(data.handicap) });
  }, []);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setStatus(data.session ? 'signedIn' : 'signedOut');
      if (data.session) void loadProfile(data.session.user.id);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      setUser(session?.user ?? null);
      setStatus((s) => (session ? 'signedIn' : s === 'guest' ? 'guest' : 'signedOut'));
      if (session) void loadProfile(session.user.id);
    });
    return () => sub.subscription.unsubscribe();
  }, [loadProfile]);

  const value = useMemo<AuthValue>(() => ({
    status,
    user,
    profile,
    cloud: !!supabase,
    async signIn(email, password) {
      if (!supabase) return 'Cloud sign-in is not configured.';
      if (!EMAIL_RE.test(email)) return 'Enter a valid email.';
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      return error ? friendly(error.message) : null;
    },
    async signUp(email, password, handle) {
      if (!supabase) return 'Cloud sign-in is not configured.';
      if (!EMAIL_RE.test(email)) return 'Enter a valid email.';
      const pw = passwordProblem(password);
      if (pw) return pw;
      const h = normalizeHandle(handle);
      if (!h) return 'Handle: 3–24 letters, numbers, dots or underscores.';
      const { error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { handle: h, display_name: h }, emailRedirectTo: window.location.origin },
      });
      return error ? friendly(error.message) : null;
    },
    async signInWithProvider(provider) {
      if (!supabase) return 'Cloud sign-in is not configured.';
      const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: window.location.origin } });
      return error ? friendly(error.message) : null;
    },
    continueAsGuest() {
      setStatus('guest');
    },
    async signOut() {
      await supabase?.auth.signOut();
      setUser(null);
      setStatus('signedOut');
    },
    async saveProfile(patch) {
      const next: Profile = {
        ...profile,
        ...patch,
        display_name: patch.display_name !== undefined ? sanitizeText(patch.display_name, 40) || profile.display_name : profile.display_name,
      };
      if (patch.handle !== undefined) {
        const h = normalizeHandle(patch.handle);
        if (!h) return 'Handle: 3–24 letters, numbers, dots or underscores.';
        next.handle = h;
      }
      if (next.handicap != null && (next.handicap < -10 || next.handicap > 54)) return 'Handicap must be between -10 and 54.';
      if (status === 'signedIn' && supabase && user) {
        const { error } = await supabase.from('profiles').update(next).eq('id', user.id);
        if (error) return /duplicate|unique/i.test(error.message) ? 'That handle is taken.' : 'Could not save profile.';
      } else {
        try { localStorage.setItem(GUEST_KEY, JSON.stringify(next)); } catch { /* blocked */ }
      }
      setProfile(next);
      return null;
    },
  }), [status, user, profile]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used inside <AuthProvider>');
  return v;
}
