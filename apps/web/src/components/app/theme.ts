export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'agile-tools-theme';
export const THEME_MEDIA_QUERY = '(prefers-color-scheme: dark)';

export function normalizeThemePreference(value: string | null | undefined): ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system' ? value : 'system';
}

export function resolveTheme(preference: ThemePreference, prefersDark: boolean): ResolvedTheme {
  if (preference === 'system') {
    return prefersDark ? 'dark' : 'light';
  }

  return preference;
}

export const THEME_INIT_SCRIPT = `(() => {
  const storageKey = '${THEME_STORAGE_KEY}';
  const mediaQuery = '${THEME_MEDIA_QUERY}';
  const normalize = (value) => value === 'light' || value === 'dark' || value === 'system' ? value : 'system';

  try {
    const preference = normalize(window.localStorage.getItem(storageKey));
    const prefersDark = window.matchMedia(mediaQuery).matches;
    const resolved = preference === 'system'
      ? (prefersDark ? 'dark' : 'light')
      : preference;

    document.documentElement.dataset.theme = resolved;
    document.documentElement.dataset.themePreference = preference;
    document.documentElement.style.colorScheme = resolved;
  } catch {
    const preference = 'system';
    const prefersDark =
      typeof window.matchMedia === 'function' && window.matchMedia(mediaQuery).matches;
    const resolved = prefersDark ? 'dark' : 'light';

    document.documentElement.dataset.theme = resolved;
    document.documentElement.dataset.themePreference = preference;
    document.documentElement.style.colorScheme = resolved;
  }
})();`;
