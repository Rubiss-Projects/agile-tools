'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { CSSProperties } from 'react';
import {
  THEME_MEDIA_QUERY,
  THEME_STORAGE_KEY,
  normalizeThemePreference,
  resolveTheme,
  type ResolvedTheme,
  type ThemePreference,
} from './theme';

interface ThemeContextValue {
  preference: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setPreference: (next: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const dockStyle: CSSProperties = {
  position: 'fixed',
  top: '1rem',
  right: '1rem',
  zIndex: 100,
  display: 'flex',
  justifyContent: 'flex-end',
};

const controlShellStyle: CSSProperties = {
  display: 'grid',
  gap: '0.5rem',
  padding: '0.7rem',
  borderRadius: '20px',
  border: '1px solid var(--color-line-strong)',
  background: 'var(--color-panel)',
  boxShadow: 'var(--shadow-soft)',
  backdropFilter: 'blur(18px)',
};

const controlLabelStyle: CSSProperties = {
  margin: 0,
  color: 'var(--color-text-soft)',
  fontFamily: 'var(--font-label)',
  fontSize: '0.68rem',
  fontWeight: 700,
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
};

function readInitialPreference(): ThemePreference {
  if (typeof document === 'undefined') {
    return 'system';
  }

  return normalizeThemePreference(document.documentElement.dataset.themePreference);
}

function readInitialResolvedTheme(): ResolvedTheme {
  if (typeof document === 'undefined') {
    return 'light';
  }

  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

function applyTheme(preference: ThemePreference): ResolvedTheme {
  const prefersDark = window.matchMedia(THEME_MEDIA_QUERY).matches;
  const resolved = resolveTheme(preference, prefersDark);

  document.documentElement.dataset.theme = resolved;
  document.documentElement.dataset.themePreference = preference;
  document.documentElement.style.colorScheme = resolved;
  window.localStorage.setItem(THEME_STORAGE_KEY, preference);

  return resolved;
}

export function AppThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(readInitialPreference);
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(readInitialResolvedTheme);

  useEffect(() => {
    setResolvedTheme(applyTheme(preference));

    const mediaQuery = window.matchMedia(THEME_MEDIA_QUERY);
    const handleChange = () => {
      if (preference === 'system') {
        setResolvedTheme(applyTheme('system'));
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [preference]);

  const value = useMemo(
    () => ({
      preference,
      resolvedTheme,
      setPreference: setPreferenceState,
    }),
    [preference, resolvedTheme],
  );

  return (
    <ThemeContext.Provider value={value}>
      {children}
      <div style={dockStyle}>
        <ThemeSwitcher />
      </div>
    </ThemeContext.Provider>
  );
}

function ThemeSwitcher() {
  const { preference, setPreference } = useTheme();

  return (
    <div style={controlShellStyle}>
      <p style={controlLabelStyle}>Color Theme</p>
      <div role="group" aria-label="Color theme" style={{ display: 'flex', gap: '0.4rem' }}>
        {(['light', 'dark', 'system'] as const).map((option) => {
          const active = option === preference;

          return (
            <button
              key={option}
              type="button"
              onClick={() => setPreference(option)}
              aria-pressed={active}
              style={{
                padding: '0.55rem 0.8rem',
                borderRadius: '9999px',
                border: `1px solid ${active ? 'var(--color-accent-strong)' : 'var(--color-line)'}`,
                background: active ? 'var(--color-accent-soft)' : 'var(--color-panel-strong)',
                color: active ? 'var(--color-accent-strong)' : 'var(--color-text)',
                fontFamily: 'var(--font-label)',
                fontSize: '0.76rem',
                fontWeight: 700,
                letterSpacing: '0.04em',
                textTransform: 'capitalize',
                cursor: 'pointer',
                transition: 'background-color 160ms ease, border-color 160ms ease, color 160ms ease',
              }}
            >
              {option}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function useTheme() {
  const value = useContext(ThemeContext);

  if (!value) {
    throw new Error('useTheme must be used inside AppThemeProvider.');
  }

  return value;
}
