import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AccentId, ACCENTS, Scheme, Theme, buildTheme } from '../theme';

const KEY = 'turzam.prefs.v1';

type Prefs = { scheme: Scheme; accent: AccentId; followUps: boolean };
const DEFAULTS: Prefs = { scheme: 'system', accent: 'cobalt', followUps: true };

type Ctx = {
  theme: Theme;
  prefs: Prefs;
  setScheme: (s: Scheme) => void;
  setAccent: (a: AccentId) => void;
  setFollowUps: (v: boolean) => void;
};

const ThemeContext = createContext<Ctx | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (!raw) return;
        const p = JSON.parse(raw) as Partial<Prefs>;
        setPrefs({
          scheme: p.scheme === 'light' || p.scheme === 'dark' || p.scheme === 'system' ? p.scheme : DEFAULTS.scheme,
          accent: ACCENTS.some((a) => a.id === p.accent) ? (p.accent as AccentId) : DEFAULTS.accent,
          followUps: typeof p.followUps === 'boolean' ? p.followUps : DEFAULTS.followUps,
        });
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const update = useCallback((patch: Partial<Prefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const isDark = prefs.scheme === 'system' ? system !== 'light' : prefs.scheme === 'dark';
  const theme = useMemo(() => buildTheme(isDark, prefs.accent), [isDark, prefs.accent]);

  const value = useMemo<Ctx>(
    () => ({
      theme,
      prefs,
      setScheme: (scheme) => update({ scheme }),
      setAccent: (accent) => update({ accent }),
      setFollowUps: (followUps) => update({ followUps }),
    }),
    [theme, prefs, update],
  );

  if (!loaded) return null;
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

function useCtx(): Ctx {
  const c = useContext(ThemeContext);
  if (!c) throw new Error('useTheme must be used inside ThemeProvider');
  return c;
}

export function useTheme(): Theme {
  return useCtx().theme;
}

export function usePrefs() {
  const { prefs, setScheme, setAccent, setFollowUps } = useCtx();
  return { prefs, setScheme, setAccent, setFollowUps };
}

/** Build a StyleSheet from the current theme. `make` should be a module-level function. */
export function useStyles<T>(make: (t: Theme) => T): T {
  const theme = useTheme();
  return useMemo(() => make(theme), [make, theme]);
}
