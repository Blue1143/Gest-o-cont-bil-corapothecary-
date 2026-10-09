import { useCallback, useEffect, useState } from 'react';

export type ThemeChoice = 'system' | 'light' | 'dark';
const KEY = 'ccih-integra.theme';

function read(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

/** Per-viewer preference; "system" follows the OS through the tokens' media query. */
export function useTheme() {
  const [theme, setTheme] = useState<ThemeChoice>(read);
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') delete root.dataset.theme;
    else root.dataset.theme = theme;
    try {
      localStorage.setItem(KEY, theme);
    } catch {
      /* storage unavailable: preference lasts for the session only */
    }
  }, [theme]);
  const cycle = useCallback(() => setTheme((t) => (t === 'system' ? 'light' : t === 'light' ? 'dark' : 'system')), []);
  return [theme, cycle] as const;
}

export const THEME_LABEL: Record<ThemeChoice, string> = { system: 'Tema: sistema', light: 'Tema: claro', dark: 'Tema: escuro' };
