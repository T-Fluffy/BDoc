import { useEffect, useState, type ReactNode } from 'react';
import { DEFAULT_SETTINGS, STORAGE_KEY, type ThemeSettings } from './themeTypes';
import { ThemeContext, type ThemeContextValue } from './context';

function loadSettings(): ThemeSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<ThemeSettings>) };
    }
  } catch {
    // ignore malformed storage
  }
  return DEFAULT_SETTINGS;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<ThemeSettings>(loadSettings);

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', settings.mode);
    root.setAttribute('data-font', settings.font);
    root.style.setProperty('--accent', settings.accent);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  const value: ThemeContextValue = {
    ...settings,
    setMode: (mode) => setSettings((s) => ({ ...s, mode })),
    setAccent: (accent) => setSettings((s) => ({ ...s, accent })),
    setFont: (font) => setSettings((s) => ({ ...s, font })),
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}