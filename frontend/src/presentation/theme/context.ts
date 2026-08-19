import { createContext } from 'react';
import type { ThemeSettings } from './themeTypes';

export interface ThemeContextValue extends ThemeSettings {
  setMode: (mode: ThemeSettings['mode']) => void;
  setAccent: (accent: string) => void;
  setFont: (font: ThemeSettings['font']) => void;
}

export const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);