import type { CSSProperties } from 'react';

export type PageSize = 'A5' | 'A4' | 'A3' | 'A2' | 'A1';
export type Orientation = 'portrait' | 'landscape';
export type MarginPreset = 'narrow' | 'normal' | 'wide';

export interface PageSettings {
  size: PageSize;
  orientation: Orientation;
  margins: MarginPreset;
}

export const DEFAULT_PAGE_SETTINGS: PageSettings = {
  size: 'A4',
  orientation: 'portrait',
  margins: 'normal',
};

export const PAGE_SIZES: PageSize[] = ['A5', 'A4', 'A3', 'A2', 'A1'];

export const MARGIN_PRESETS: { value: MarginPreset; label: string }[] = [
  { value: 'narrow', label: 'Narrow' },
  { value: 'normal', label: 'Normal' },
  { value: 'wide', label: 'Wide' },
];

/** Page dimensions in millimetres (ISO 216). */
export const PAGE_DIMENSIONS_MM: Record<PageSize, { w: number; h: number }> = {
  A5: { w: 148, h: 210 },
  A4: { w: 210, h: 297 },
  A3: { w: 297, h: 420 },
  A2: { w: 420, h: 594 },
  A1: { w: 594, h: 841 },
};

const MARGIN_MM: Record<MarginPreset, number> = {
  narrow: 12,
  normal: 20,
  wide: 30,
};

export function resolvePageStyle(s: PageSettings): CSSProperties {
  const dim = PAGE_DIMENSIONS_MM[s.size];
  const w = s.orientation === 'landscape' ? dim.h : dim.w;
  const h = s.orientation === 'landscape' ? dim.w : dim.h;
  const m = MARGIN_MM[s.margins];
  return {
    width: `${w}mm`,
    minHeight: `${h}mm`,
    padding: `${m}mm`,
  };
}

export function parsePageSettings(raw: string | null | undefined): PageSettings {
  if (!raw) return { ...DEFAULT_PAGE_SETTINGS };
  try {
    const parsed = JSON.parse(raw) as Partial<PageSettings>;
    return {
      size: (PAGE_SIZES as string[]).includes(parsed.size ?? '')
        ? (parsed.size as PageSize)
        : DEFAULT_PAGE_SETTINGS.size,
      orientation: parsed.orientation === 'landscape' ? 'landscape' : 'portrait',
      margins: (MARGIN_PRESETS.map((m) => m.value) as string[]).includes(parsed.margins ?? '')
        ? (parsed.margins as MarginPreset)
        : DEFAULT_PAGE_SETTINGS.margins,
    };
  } catch {
    return { ...DEFAULT_PAGE_SETTINGS };
  }
}
