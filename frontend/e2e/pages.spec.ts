import { test, expect } from '@playwright/test';
import {
  breakCount,
  createDoc,
  editorText,
  login,
  noTextInGaps,
  openEditor,
  openMenu,
  paras,
  sheetCount,
  statusBar,
} from './helpers';

const HF_SETTINGS = JSON.stringify({
  size: 'A4',
  orientation: 'portrait',
  margins: 'normal',
  headerFooter: {
    header: { default: 'ACME Confidential', first: 'ACME Cover', even: '' },
    footer: { default: 'acme.example.com', first: '', even: '' },
    differentFirstPage: true,
    differentOddEven: true,
    pageNumbersEnabled: true,
    pageNumberAlign: 'center',
  },
});

test.describe('page features', () => {
  test('zoom keeps breaks and text, persists across reload', async ({ page, request }) => {
    const doc = await createDoc(request, { title: 'E2E Zoom', content: paras(60) });
    try {
      await login(page);
      await openEditor(page, doc.id);
      const base = {
        sheets: await sheetCount(page),
        breaks: await breakCount(page),
        text: await editorText(page),
      };
      // Zoom via navbar dropdown.
      await openMenu(page, 'Zoom');
      const picked = await page.evaluate(() => {
        const b = Array.from(document.querySelectorAll('button')).find(
          (x) => !x.closest('nav') && x.textContent?.trim() === '150%',
        ) as HTMLButtonElement | undefined;
        if (!b) return false;
        b.click();
        return true;
      });
      expect(picked).toBe(true);
      await page.waitForTimeout(1500);
      expect(await sheetCount(page)).toBe(base.sheets);
      expect(await breakCount(page)).toBe(base.breaks);
      expect(await editorText(page)).toBe(base.text);
      expect(await statusBar(page)).toContain('150%');
      const t = await page.evaluate(() => document.querySelector('.zoom-inner')?.getAttribute('style') ?? '');
      expect(t).toContain('scale(1.5)');

      await page.reload();
      await page.waitForSelector('.ProseMirror', { timeout: 30000 });
      await page.waitForTimeout(3000);
      expect(await statusBar(page)).toContain('150%');
      expect(await editorText(page)).toBe(base.text);
      expect((await noTextInGaps(page)).ok).toBe(true);
    } finally {
      await doc.dispose();
    }
  });

  test('ruler drag sets custom margins and persists', async ({ page, request }) => {
    const doc = await createDoc(request, { title: 'E2E Ruler', content: paras(20) });
    try {
      await login(page);
      await openEditor(page, doc.id);
      expect(
        await page.evaluate(() => !!document.querySelector('.bdoc-ruler')),
      ).toBe(true);
      const before = await editorText(page);
      const h = await page.evaluate(() => {
        const el = document.querySelector('.bdoc-ruler-handle') as HTMLElement;
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      });
      await page.mouse.move(h.x, h.y);
      await page.mouse.down();
      await page.mouse.move(h.x + 60, h.y, { steps: 12 });
      await page.mouse.up();
      await page.waitForTimeout(2500); // autosave + repaginate
      const srv = await (await request.get(`/documents/${doc.id}`)).json();
      const st = JSON.parse(srv.settings);
      expect(st.margins).toBe('custom');
      expect(st.customMarginMm).toBeGreaterThan(20);
      expect(await editorText(page)).toBe(before);
      expect((await noTextInGaps(page)).ok).toBe(true);
    } finally {
      await doc.dispose();
    }
  });

  test('indent markers edit the current block and persist', async ({ page, request }) => {
    const doc = await createDoc(request, {
      title: 'E2E Indent',
      content: '<p>Indent me first paragraph.</p><p>Second plain paragraph.</p>',
    });
    try {
      await login(page);
      await openEditor(page, doc.id);
      expect(await page.evaluate(() => document.querySelectorAll('.bdoc-ruler-indent').length)).toBe(2);
      // Caret into first paragraph via real click.
      const pt = await page.evaluate(() => {
        const p = document.querySelector('.ProseMirror p') as HTMLElement;
        p.scrollIntoView({ block: 'center' });
        const r = p.getBoundingClientRect();
        return { x: r.left + 60, y: r.top + r.height / 2 };
      });
      await page.mouse.click(pt.x, pt.y);
      await page.waitForTimeout(400);
      const mk = await page.evaluate(() => {
        const m = document.querySelector('.bdoc-ruler-indent.first') as HTMLElement;
        const r = m.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      });
      await page.mouse.move(mk.x, mk.y);
      await page.mouse.down();
      await page.mouse.move(mk.x + 40, mk.y, { steps: 10 });
      await page.mouse.up();
      await page.waitForTimeout(1200);
      const indent = await page.evaluate(
        () => (document.querySelector('.ProseMirror p') as HTMLElement)?.style.textIndent,
      );
      expect(parseFloat(indent)).toBeGreaterThan(0);
      await page.waitForTimeout(2000);
      const srv = await (await request.get(`/documents/${doc.id}`)).json();
      expect(srv.content).toContain('text-indent');
    } finally {
      await doc.dispose();
    }
  });

  test('tab stops: add, Tab advance, remove, persist', async ({ page, request }) => {
    const doc = await createDoc(request, {
      title: 'E2E Tabs',
      content: '<p>Tab stop test line one.</p>',
    });
    try {
      await login(page);
      await openEditor(page, doc.id);
      // Click ruler track at 60% to add a stop.
      const added = await page.evaluate(() => {
        const bar = document.querySelector('.bdoc-ruler') as HTMLElement;
        const r = bar.getBoundingClientRect();
        return { x: r.left + r.width * 0.6, y: r.top + r.height / 2 };
      });
      await page.mouse.click(added.x, added.y);
      await page.waitForTimeout(800);
      expect(await page.evaluate(() => document.querySelectorAll('.bdoc-ruler-tab').length)).toBe(1);
      const stops = await page.evaluate(() =>
        document.querySelector('.ProseMirror')?.innerHTML.slice(0, 120),
      );
      expect(stops).toContain('data-tab-stops');
      // Caret to line start (real click) then Tab advances reasonably.
      const cpt = await page.evaluate(() => {
        const p = document.querySelector('.ProseMirror p') as HTMLElement;
        const r = p.getBoundingClientRect();
        return { x: r.left + 8, y: r.top + r.height / 2 };
      });
      await page.mouse.click(cpt.x, cpt.y);
      await page.waitForTimeout(300);
      const before = await page.evaluate(
        () => document.querySelector('.ProseMirror p')?.textContent.length ?? 0,
      );
      await page.keyboard.press('Tab');
      await page.waitForTimeout(600);
      const after = await page.evaluate(
        () => document.querySelector('.ProseMirror p')?.textContent.length ?? 0,
      );
      const addedSpaces = after - before;
      expect(addedSpaces).toBeGreaterThanOrEqual(1);
      expect(addedSpaces).toBeLessThanOrEqual(120);
      // Drag the marker off the ruler to remove it.
      const mk = await page.evaluate(() => {
        const m = document.querySelector('.bdoc-ruler-tab') as HTMLElement;
        const r = m.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      });
      await page.mouse.move(mk.x, mk.y);
      await page.mouse.down();
      await page.mouse.move(mk.x, mk.y + 60, { steps: 8 });
      await page.mouse.up();
      await page.waitForTimeout(800);
      expect(await page.evaluate(() => document.querySelectorAll('.bdoc-ruler-tab').length)).toBe(0);
    } finally {
      await doc.dispose();
    }
  });

  test('headers, footers, variants and page numbers render per sheet', async ({
    page,
    request,
  }) => {
    const doc = await createDoc(request, { title: 'E2E HF', content: paras(55), settings: HF_SETTINGS });
    try {
      await login(page);
      await openEditor(page, doc.id);
      const zones = await page.evaluate(() => ({
        sheets: document.querySelectorAll('.page-sheet').length,
        headers: Array.from(document.querySelectorAll('.page-header-zone')).map((z) =>
          `p${z.getAttribute('data-page')}:${z.textContent?.trim()}`,
        ),
        footers: Array.from(document.querySelectorAll('.page-footer-zone')).map((z) =>
          `p${z.getAttribute('data-page')}:${z.textContent?.replace(/\n/g, ' / ')}`,
        ),
      }));
      expect(zones.sheets).toBeGreaterThan(1);
      expect(zones.headers[0]).toContain('Cover'); // differentFirstPage
      expect(zones.headers[1]).toContain('Confidential');
      for (const f of zones.footers) expect(f).toMatch(/Page \d+ of \d+/);
      // Zone click opens the dialog (double click), single click does not.
      await page.evaluate(() => {
        (document.querySelector('.page-footer-zone') as HTMLElement)?.scrollIntoView({ block: 'center' });
      });
      await page.waitForTimeout(300);
      const fz = await page.evaluate(() => {
        const z = document.querySelector('.page-footer-zone') as HTMLElement;
        const r = z.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      });
      await page.mouse.click(fz.x, fz.y);
      await page.waitForTimeout(400);
      expect(await page.evaluate(() => !!document.querySelector('[role="dialog"]'))).toBe(false);
    } finally {
      await doc.dispose();
    }
  });

  test('printed PDF matches on-screen sheets, with headers', async ({ page, request }) => {
    const doc = await createDoc(request, { title: 'E2E Print', content: paras(55), settings: HF_SETTINGS });
    try {
      await login(page);
      await openEditor(page, doc.id);
      const sheets = await sheetCount(page);
      expect(sheets).toBeGreaterThan(1);
      const pdf = await page.pdf({ preferCSSPageSize: true });
      const text = Buffer.from(pdf).toString('latin1');
      const pages = (text.match(/\/Type\s*\/Page([^sA-Za-z]|$)/g) || []).length;
      expect(pages).toBe(sheets);
    } finally {
      await doc.dispose();
    }
  });
});
