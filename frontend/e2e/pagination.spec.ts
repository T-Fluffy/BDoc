import { test, expect } from '@playwright/test';
import {
  bulletList,
  breakCount,
  createDoc,
  login,
  noTextInGaps,
  openEditor,
  paras,
  sheetCount,
  statusBar,
  table,
} from './helpers';

test.describe('pagination engine', () => {
  test('edge document does not run away and stays stable', async ({ page, request }) => {
    const html =
      paras(20) + table(8) + bulletList(60) + paras(10, 'Tail');
    const doc = await createDoc(request, { title: 'E2E Edge', content: html });
    try {
      await login(page);
      await openEditor(page, doc.id);
      const a = await sheetCount(page);
      expect(a).toBeGreaterThan(1);
      await page.waitForTimeout(5000);
      const b = await sheetCount(page);
      // Stable: no growth across the window (runaway guard).
      expect(b).toBe(a);
      expect(b).toBeLessThan(30);
    } finally {
      await doc.dispose();
    }
  });

  test('no content paints inside inter-page gaps', async ({ page, request }) => {
    let html = '';
    const lens = [1, 3, 2, 5, 1, 4, 2, 2, 6, 1];
    lens.forEach((n, i) => {
      if (i === 4) html += '<h2>Section heading one</h2>';
      html += `<p>Para ${i + 1}: ` + 'The quick brown fox jumps over the lazy dog. '.repeat(n) + '</p>';
    });
    html += bulletList(6) + table(8);
    const doc = await createDoc(request, { title: 'E2E Gaps', content: html });
    try {
      await login(page);
      await openEditor(page, doc.id);
      const res = await noTextInGaps(page);
      expect(res.bad).toEqual([]);
      // Spacer bottoms land on sheet content tops (within rounding).
      const offs = await page.evaluate(() => {
        const base = document.querySelector('.bdoc-page')!.getBoundingClientRect().top;
        const sheets = Array.from(document.querySelectorAll('.page-sheet')).map((s) => {
          const r = s.getBoundingClientRect();
          return { top: r.top - base, bottom: r.bottom - base };
        });
        const pxmm = 96 / 25.4;
        return Array.from(document.querySelectorAll('.page-break')).map((el) => {
          const r = el.getBoundingClientRect();
          const bottom = r.bottom - base;
          // nearest sheet content top at/below the spacer bottom
          const targets = sheets.map((s) => s.top + 20 * pxmm);
          const t = targets.find((tt) => tt >= bottom - 200) ?? targets[targets.length - 1];
          return Math.abs(bottom - t);
        });
      });
      for (const o of offs) expect(o).toBeLessThan(3);
    } finally {
      await doc.dispose();
    }
  });

  test('new document starts at one page, grows and shrinks with content', async ({
    page,
    request,
  }) => {
    const big = await createDoc(request, { title: 'E2E Big', content: paras(60) });
    try {
      await login(page);
      await openEditor(page, big.id);
      expect(await sheetCount(page)).toBeGreaterThan(1);

      // File > New (client-side navigation, same component instance).
      await page.evaluate(() => {
        const b = Array.from(document.querySelectorAll('nav > div:last-child button')).find(
          (x) => x.textContent?.trim() === 'File',
        ) as HTMLButtonElement | undefined;
        b?.click();
      });
      await page.waitForTimeout(400);
      const newClicked = await page.evaluate(() => {
        const b = Array.from(document.querySelectorAll('button')).find(
          (x) => !x.closest('nav') && x.textContent?.trim().startsWith('New'),
        ) as HTMLButtonElement | undefined;
        if (!b) return false;
        b.click();
        return true;
      });
      expect(newClicked).toBe(true);
      await page.waitForFunction((old: string) => !window.location.pathname.endsWith(old), big.id, {
        timeout: 20000,
      }).catch(() => undefined);
      await page.waitForTimeout(3000);
      const newId = page.url().split('/').pop()!;
      expect(await sheetCount(page)).toBe(1);
      expect(await statusBar(page)).toContain('Page 1 of 1');

      // Grow by typing.
      await page.evaluate(() => (document.querySelector('.ProseMirror') as HTMLElement).focus());
      for (let i = 1; i <= 30; i++) {
        await page.keyboard.type(`Growth paragraph ${i} with enough words to wrap onto multiple lines here.`, {
          delay: 10,
        });
        await page.keyboard.press('Enter');
        await page.waitForTimeout(60);
      }
      await page.waitForTimeout(2500);
      expect(await sheetCount(page)).toBeGreaterThan(1);

      // Shrink back to one page.
      await page.keyboard.press('ControlOrMeta+a');
      await page.keyboard.press('Backspace');
      await page.waitForTimeout(2500);
      expect(await sheetCount(page)).toBe(1);
      expect(await statusBar(page)).toContain('Page 1 of 1');

      const check = await request.delete(`/documents/${newId}`).catch(() => null);
      void check;
    } finally {
      await big.dispose();
    }
  });

  test('headings are never stranded at page bottoms', async ({ page, request }) => {
    for (const n of [15, 17, 19, 21]) {
      let html = '';
      for (let s = 1; s <= 4; s++) {
        for (let i = 1; i <= n; i++) html += `<p>Section ${s} filler ${i} with body text.</p>`;
        html += `<h2>Section ${s} heading</h2><p>First paragraph under it.</p><p>Second paragraph under it.</p>`;
      }
      const doc = await createDoc(request, { title: `E2E Head ${n}`, content: html });
      try {
        await login(page);
        await openEditor(page, doc.id);
        const stranded = await page.evaluate(() =>
          Array.from(document.querySelectorAll('.page-break')).filter((br) => {
            const prev = br.previousElementSibling;
            return !!prev && /^H[1-6]$/.test(prev.tagName);
          }).length,
        );
        expect(stranded).toBe(0);
        const before = await breakCount(page);
        const textBefore = await page.evaluate(
          () => document.querySelector('.ProseMirror')?.innerText ?? '',
        );
        await page.waitForTimeout(2500);
        expect(await breakCount(page)).toBe(before);
        expect(
          await page.evaluate(() => document.querySelector('.ProseMirror')?.innerText ?? ''),
        ).toBe(textBefore);
      } finally {
        await doc.dispose();
      }
    }
  });

  test('over-page tables split and keep all rows', async ({ page, request }) => {
    const doc = await createDoc(request, {
      title: 'E2E Table',
      content: `<p>Intro.</p>${table(40)}<p>Outro.</p>`,
    });
    try {
      await login(page);
      await openEditor(page, doc.id);
      const stats = await page.evaluate(() => ({
        tables: document.querySelectorAll('.ProseMirror table').length,
        rows: document.querySelectorAll('.ProseMirror table tr').length,
        breaks: document.querySelectorAll('.page-break').length,
        text: document.querySelector('.ProseMirror')?.innerText ?? '',
      }));
      expect(stats.tables).toBeGreaterThanOrEqual(2);
      expect(stats.rows).toBe(40);
      await page.waitForTimeout(3000);
      const later = await page.evaluate(() => ({
        tables: document.querySelectorAll('.ProseMirror table').length,
        breaks: document.querySelectorAll('.page-break').length,
        text: document.querySelector('.ProseMirror')?.innerText ?? '',
      }));
      expect(later.tables).toBe(stats.tables);
      expect(later.breaks).toBe(stats.breaks);
      expect(later.text).toBe(stats.text);
    } finally {
      await doc.dispose();
    }
  });

  test('heading levels survive load', async ({ page, request }) => {
    const doc = await createDoc(request, {
      title: 'E2E Levels',
      content: '<h1>One</h1><h2>Two</h2><h3>Three</h3><p>Body.</p>',
    });
    try {
      await login(page);
      await openEditor(page, doc.id);
      const tags = await page.evaluate(() =>
        Array.from(document.querySelector('.ProseMirror')!.children).map((el) => el.tagName).join(','),
      );
      expect(tags).toBe('H1,H2,H3,P');
    } finally {
      await doc.dispose();
    }
  });

  test('caret page tracks selection across pages', async ({ page, request }) => {
    const doc = await createDoc(request, { title: 'E2E Caret', content: paras(60) });
    try {
      await login(page);
      await openEditor(page, doc.id);
      // Click a paragraph ~70% through the document.
      await page.evaluate(() => {
        const pm = document.querySelector('.ProseMirror')!;
        const all = pm.querySelectorAll('p');
        const p = all[Math.floor(all.length * 0.7)];
        const tn = p.firstChild!;
        const range = document.createRange();
        range.setStart(tn, Math.min(5, tn.textContent?.length ?? 0));
        range.collapse(true);
        const sel = window.getSelection()!;
        sel.removeAllRanges();
        sel.addRange(range);
        (pm as HTMLElement).focus();
      });
      await page.waitForTimeout(800);
      const bar = await statusBar(page);
      expect(bar).not.toContain('Page 1 of');
      expect(bar).toMatch(/Page \d+ of \d+/);
    } finally {
      await doc.dispose();
    }
  });
});
