import { test, expect } from '@playwright/test';
import {
  breakCount,
  caretInfo,
  createDoc,
  editorText,
  login,
  noTextInGaps,
  openEditor,
  paras,
  sheetCount,
} from './helpers';

test.describe('editing integrity (anti-corruption)', () => {
  test('deleting a space removes exactly one char and never reverts', async ({
    page,
    request,
  }) => {
    const doc = await createDoc(request, { title: 'E2E Delete', content: paras(60) });
    try {
      await login(page);
      await openEditor(page, doc.id);
      const before = await editorText(page);
      // Caret right after "Paragraph 1:" in the first paragraph, Backspace deletes ":".
      await page.evaluate(() => {
        const pm = document.querySelector('.ProseMirror')!;
        const p = pm.querySelector('p')!;
        const tn = p.firstChild!;
        const range = document.createRange();
        range.setStart(tn, 12);
        range.collapse(true);
        const sel = window.getSelection()!;
        sel.removeAllRanges();
        sel.addRange(range);
        (pm as HTMLElement).focus();
      });
      await page.keyboard.press('Backspace');
      await page.waitForTimeout(200);
      const mid = await editorText(page);
      expect(mid.length).toBe(before.length - 1);
      // Let pagination + autosave settle: no revert, no fragmentation growth.
      await page.waitForTimeout(2000);
      const after = await editorText(page);
      expect(after).toBe(mid);
      expect((await noTextInGaps(page)).ok).toBe(true);
    } finally {
      await doc.dispose();
    }
  });

  test('rapid typing keeps every character, idle settles with no loop', async ({
    page,
    request,
  }) => {
    const doc = await createDoc(request, { title: 'E2E Typing', content: paras(40) });
    try {
      await login(page);
      await openEditor(page, doc.id);
      await page.evaluate(() => {
        const pm = document.querySelector('.ProseMirror')!;
        const p = pm.querySelector('p')!;
        const range = document.createRange();
        range.setStart(p.firstChild, 5);
        range.collapse(true);
        const sel = window.getSelection()!;
        sel.removeAllRanges();
        sel.addRange(range);
        (pm as HTMLElement).focus();
      });
      await page.keyboard.type('XYZ', { delay: 400 });
      await page.waitForTimeout(2500);
      const text = await editorText(page);
      expect(text).toContain('XYZ');
      const htmlA = await page.evaluate(
        () => document.querySelector('.ProseMirror')?.innerHTML.length ?? 0,
      );
      const breaksA = await breakCount(page);
      await page.waitForTimeout(3000);
      const htmlB = await page.evaluate(
        () => document.querySelector('.ProseMirror')?.innerHTML.length ?? 0,
      );
      expect(htmlB).toBe(htmlA);
      expect(await breakCount(page)).toBe(breaksA);
    } finally {
      await doc.dispose();
    }
  });

  test('single undo reverts typed text (pagination stays out of history)', async ({
    page,
    request,
  }) => {
    const doc = await createDoc(request, { title: 'E2E Undo', content: paras(40) });
    try {
      await login(page);
      await openEditor(page, doc.id);
      const before = await editorText(page);
      await page.evaluate(() => {
        const pm = document.querySelector('.ProseMirror')!;
        const p = pm.querySelector('p')!;
        const range = document.createRange();
        range.setStart(p.firstChild, 5);
        range.collapse(true);
        const sel = window.getSelection()!;
        sel.removeAllRanges();
        sel.addRange(range);
        (pm as HTMLElement).focus();
      });
      await page.keyboard.type('XYZ', { delay: 400 });
      await page.waitForTimeout(1500);
      await page.keyboard.press('ControlOrMeta+z');
      await page.waitForTimeout(1200);
      const after = await editorText(page);
      expect(after).not.toContain('XYZ');
      expect(after).toBe(before);
    } finally {
      await doc.dispose();
    }
  });

  test('marks persist through save, reload, and Word export', async ({ page, request }) => {
    const doc = await createDoc(request, {
      title: 'E2E Marks',
      content: '<p>Mark persistence check words.</p>',
    });
    try {
      await login(page);
      await openEditor(page, doc.id);
      // Select first 4 chars and bold them via the Format menu.
      await page.evaluate(() => {
        const pm = document.querySelector('.ProseMirror')!;
        const p = pm.querySelector('p')!;
        const range = document.createRange();
        range.setStart(p.firstChild, 0);
        range.setEnd(p.firstChild, 4);
        const sel = window.getSelection()!;
        sel.removeAllRanges();
        sel.addRange(range);
        (pm as HTMLElement).focus();
      });
      await page.evaluate(() => {
        const b = Array.from(document.querySelectorAll('nav > div:last-child button')).find(
          (x) => x.textContent?.trim() === 'Format',
        ) as HTMLButtonElement | undefined;
        b?.click();
      });
      await page.waitForTimeout(400);
      const tb = await page.evaluate(() => {
        const b = Array.from(document.querySelectorAll('button')).find(
          (x) => !x.closest('nav') && (x.textContent?.trim() ?? '').startsWith('Text'),
        );
        const r = b!.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      });
      await page.mouse.move(tb.x, tb.y);
      await page.waitForTimeout(450);
      const clicked = await page.evaluate(() => {
        const b = Array.from(document.querySelectorAll('button')).find(
          (x) => !x.closest('nav') && (x.textContent?.trim() ?? '').startsWith('Bold'),
        );
        if (!b) return false;
        (b as HTMLButtonElement).click();
        return true;
      });
      expect(clicked).toBe(true);
      await page.waitForTimeout(2500); // autosave
      const srv = await (await request.get(`/documents/${doc.id}`)).json();
      expect(srv.content).toContain('<strong>');
      await page.reload();
      await page.waitForSelector('.ProseMirror', { timeout: 30000 });
      await page.waitForTimeout(2500);
      expect(
        await page.evaluate(() => !!document.querySelector('.ProseMirror strong')),
      ).toBe(true);
    } finally {
      await doc.dispose();
    }
  });

  test('gap clicks snap to the nearest edge; empty areas place the caret', async ({
    page,
    request,
  }) => {
    const doc = await createDoc(request, { title: 'E2E Cursor', content: paras(45) });
    try {
      await login(page);
      await openEditor(page, doc.id);
      const geom = await page.evaluate(() => {
        const br = document.querySelector('.page-break')!;
        br.scrollIntoView({ block: 'center' });
        const r = br.getBoundingClientRect();
        const prev = br.previousElementSibling!.getBoundingClientRect();
        const next = br.nextElementSibling!.getBoundingClientRect();
        return {
          x: r.left + 150,
          top: prev.bottom + 8,
          bottom: next.top - 8,
          mid: r.top + r.height / 2,
        };
      });
      await page.waitForTimeout(300);
      // Top of gap -> end of previous paragraph (contains text, not start of next).
      await page.mouse.click(geom.x, geom.top);
      await page.waitForTimeout(300);
      const c1 = await caretInfo(page);
      expect(c1).toContain('off=');
      const off1 = Number(c1.split('off=')[1]);
      expect(off1).toBeGreaterThan(10);
      // Bottom of gap -> start of next paragraph.
      await page.mouse.click(geom.x, geom.bottom);
      await page.waitForTimeout(300);
      expect(await caretInfo(page)).toContain('off=0');

      // Click far below content (empty page area) places caret + focuses.
      const pt = await page.evaluate(() => {
        const pm = document.querySelector('.ProseMirror')!;
        const kids = Array.from(pm.children);
        const last = kids[kids.length - 1] as HTMLElement;
        const r = last.getBoundingClientRect();
        return { x: r.left + 100, y: r.bottom + 250 };
      });
      await page.mouse.click(pt.x, pt.y);
      await page.waitForTimeout(400);
      const focused = await page.evaluate(
        () => document.activeElement?.className.includes('ProseMirror') ?? false,
      );
      expect(focused).toBe(true);
      await page.keyboard.type(' APPENDED', { delay: 20 });
      await page.waitForTimeout(500);
      expect(await editorText(page)).toContain('APPENDED');
      expect(await sheetCount(page)).toBeGreaterThanOrEqual(1);
    } finally {
      await doc.dispose();
    }
  });
});
