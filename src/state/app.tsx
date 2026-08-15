import {
  createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode,
} from 'react';
import { api, ApiError } from '../lib/api';
import type { Settings, User } from '../lib/types';

type Theme = 'dark' | 'light';

interface AppState {
  user: User | null;
  settings: Settings;
  loading: boolean;
  theme: Theme;
  setTheme: (t: Theme) => void;
  signIn: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  saveSettings: (patch: Partial<Settings>) => Promise<void>;
  refreshUser: () => Promise<void>;
}

const FALLBACK_SETTINGS: Settings = {
  theme: 'dark', calendar: 'both', weekStart: 6, currency: 'IRT', units: 'metric',
  dailyFocusGoalMin: 240, waterGoalMl: 2500, sleepGoalHours: 7.5,
};

const AppContext = createContext<AppState | null>(null);

export function useApp(): AppState {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>');
  return ctx;
}

/** Convenience: settings are read far more often than the rest of the state. */
export const useSettings = () => useApp().settings;

function readStoredTheme(): Theme {
  try {
    const saved = localStorage.getItem('routine.theme');
    if (saved === 'light' || saved === 'dark') return saved;
  } catch { /* storage blocked */ }
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [theme, setThemeState] = useState<Theme>(readStoredTheme);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem('routine.theme', t); } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const refreshUser = useCallback(async () => {
    try {
      const res = await api.get<{ user: User }>('/api/auth/me');
      setUser(res.user);
      // A theme saved on the account wins over the local guess once known.
      if (res.user.settings.theme === 'dark' || res.user.settings.theme === 'light') {
        setTheme(res.user.settings.theme);
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) setUser(null);
      else throw err;
    }
  }, [setTheme]);

  useEffect(() => {
    (async () => {
      try { await refreshUser(); } catch { /* offline — the login screen handles it */ }
      finally { setLoading(false); }
    })();
  }, [refreshUser]);

  const signIn = useCallback(async (email: string, password: string) => {
    const res = await api.post<{ user: User }>('/api/auth/login', { email, password });
    setUser(res.user);
    if (res.user.settings.theme === 'dark' || res.user.settings.theme === 'light') setTheme(res.user.settings.theme);
  }, [setTheme]);

  const register = useCallback(async (name: string, email: string, password: string) => {
    const res = await api.post<{ user: User }>('/api/auth/register', { name, email, password });
    setUser(res.user);
  }, []);

  const signOut = useCallback(async () => {
    try { await api.post('/api/auth/logout'); } finally { setUser(null); }
  }, []);

  const saveSettings = useCallback(async (patch: Partial<Settings>) => {
    const res = await api.put<{ settings: Settings }>('/api/auth/settings', patch);
    setUser((u) => (u ? { ...u, settings: res.settings } : u));
    if (patch.theme === 'dark' || patch.theme === 'light') setTheme(patch.theme);
  }, [setTheme]);

  const value = useMemo<AppState>(() => ({
    user,
    settings: user?.settings ?? FALLBACK_SETTINGS,
    loading, theme, setTheme, signIn, register, signOut, saveSettings, refreshUser,
  }), [user, loading, theme, setTheme, signIn, register, signOut, saveSettings, refreshUser]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
