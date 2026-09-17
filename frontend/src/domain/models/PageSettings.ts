import type { CSSProperties } from 'react';

export type PageSize = 'A5' | 'A4' | 'A3' | 'A2' | 'A1';
export type Orientation = 'portrait' | 'landscape';
export type MarginPreset = 'narrow' | 'normal' | 'wide';

export interface PageSettings {
  size: PageSize;
  orientation: Orientation;
  margins: MarginPreset;
  headerFooter?: HeaderFooterSettings;
}

export type PageNumberAlign = 'left' | 'center' | 'right';

export interface HeaderFooterContent {
  default: string;
  first: string;
  even: string;
}

export interface HeaderFooterSettings {
  header: HeaderFooterContent;
  footer: HeaderFooterContent;
  differentFirstPage: boolean;
  differentOddEven: boolean;
  pageNumbersEnabled: boolean;
  pageNumberAlign: PageNumberAlign;
}

const EMPTY_HF_CONTENT: HeaderFooterContent = { default: '', first: '', even: '' };

export const DEFAULT_HEADER_FOOTER: HeaderFooterSettings = {
  header: { ...EMPTY_HF_CONTENT },
  footer: { ...EMPTY_HF_CONTENT },
  differentFirstPage: false,
  differentOddEven: false,
  pageNumbersEnabled: false,
  pageNumberAlign: 'center',
};

/** Resolve effective header/footer settings with safe defaults (deep-copied). */
export function resolveHeaderFooter(s: PageSettings): HeaderFooterSettings {
  const hf = s.headerFooter;
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  const content = (c: Partial<HeaderFooterContent> | undefined): HeaderFooterContent => ({
    default: str(c?.default),
    first: str(c?.first),
    even: str(c?.even),
  });
  const align: PageNumberAlign =
    hf?.pageNumberAlign === 'left' || hf?.pageNumberAlign === 'right' ? hf.pageNumberAlign : 'center';
  return {
    header: content(hf?.header),
    footer: content(hf?.footer),
    differentFirstPage: hf?.differentFirstPage === true,
    differentOddEven: hf?.differentOddEven === true,
    pageNumbersEnabled: hf?.pageNumbersEnabled === true,
    pageNumberAlign: align,
  };
}

/**
 * Pick the header/footer text for a 1-based page number. Variant strings fall
 * back to the default text when empty (friendlier than a blank page zone).
 */
export function headerFooterTextForPage(
  hf: HeaderFooterSettings,
  kind: 'header' | 'footer',
  page: number,
): string {
  const c = hf[kind];
  if (page === 1 && hf.differentFirstPage && c.first) return c.first;
  if (page % 2 === 0 && hf.differentOddEven && c.even) return c.even;
  return c.default;
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

export const MARGIN_MM: Record<MarginPreset, number> = {
  narrow: 12,
  normal: 20,
  wide: 30,
};

/** Zoom presets (fraction of 100%) + persistence key. */
export const ZOOM_PRESETS = [0.5, 0.75, 1, 1.25, 1.5, 2];
export const ZOOM_STORAGE_KEY = 'bdoc-zoom';

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
    const base: PageSettings = {
      size: (PAGE_SIZES as string[]).includes(parsed.size ?? '')
        ? (parsed.size as PageSize)
        : DEFAULT_PAGE_SETTINGS.size,
      orientation: parsed.orientation === 'landscape' ? 'landscape' : 'portrait',
      margins: (MARGIN_PRESETS.map((m) => m.value) as string[]).includes(parsed.margins ?? '')
        ? (parsed.margins as MarginPreset)
        : DEFAULT_PAGE_SETTINGS.margins,
    };
    base.headerFooter = resolveHeaderFooter({ ...base, headerFooter: parsed.headerFooter });
    return base;
  } catch {
    return { ...DEFAULT_PAGE_SETTINGS };
  }
}
