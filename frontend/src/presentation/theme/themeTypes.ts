export type ThemeMode = 'dark' | 'light';
export type EditorFont = 'sans' | 'serif' | 'mono';

export interface ThemeSettings {
  mode: ThemeMode;
  accent: string;
  font: EditorFont;
}

export const STORAGE_KEY = 'bdoc-theme';

export const DEFAULT_SETTINGS: ThemeSettings = {
  mode: 'dark',
  accent: '#3b82f6',
  font: 'sans',
};

export const ACCENT_PRESETS = [
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Indigo', value: '#6366f1' },
  { name: 'Violet', value: '#8b5cf6' },
  { name: 'Pink', value: '#ec4899' },
  { name: 'Rose', value: '#f43f5e' },
  { name: 'Orange', value: '#f97316' },
  { name: 'Amber', value: '#f59e0b' },
  { name: 'Emerald', value: '#10b981' },
  { name: 'Teal', value: '#14b8a6' },
  { name: 'Cyan', value: '#06b6d4' },
];