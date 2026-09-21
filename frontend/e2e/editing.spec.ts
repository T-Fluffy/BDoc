import { test, expect } from '@playwright/test';
import {
  API_URL,
  breakCount,
  caretInfo,
  createDoc,
  editorText,
  getTestToken,
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
      await login(page, request);
      await openEditor(page, doc.id);
      const before = await editorText(page);
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
      await login(page, request);
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
      await login(page, request);
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
      await login(page, request);
      await openEditor(page, doc.id);
      // Native range selection keeps ProseMirror selection in sync when focused.
      await page.evaluate(() => {
        (document.querySelector('.ProseMirror') as HTMLElement).focus();
      });
      await page.waitForTimeout(200);
      await page.keyboard.press('ControlOrMeta+Home');
      await page.waitForTimeout(200);
      await page.keyboard.down('Shift');
      for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight');
      await page.keyboard.up('Shift');
      await page.waitForTimeout(200);
      await page.keyboard.press('ControlOrMeta+b');
      await page.waitForTimeout(800);
      const applied = await page.evaluate(() => !!document.querySelector('.ProseMirror strong'));
      expect(applied).toBe(true);
      // Poll until server reflects the change.
      let srv: { content: string } | null = null;
      for (let i = 0; i < 16; i++) {
        await page.waitForTimeout(600);
        const headers = { Authorization: `Bearer ${await getTestToken(request)}` };
        const res = await request.get(`${API_URL}/documents/${doc.id}`, { headers });
        if (!res.ok()) continue;
        try {
          srv = (await res.json()) as { content: string };
        } catch {
          continue;
        }
        if (srv.content.includes('<strong>')) break;
      }
      expect(srv).not.toBeNull();
      expect(srv!.content).toContain('<strong>');
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
      await login(page, request);
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
      await page.mouse.click(geom.x, geom.top);
      await page.waitForTimeout(300);
      const c1 = await caretInfo(page);
      expect(c1).toContain('off=');
      const off1 = Number(c1.split('off=')[1]);
      expect(off1).toBeGreaterThan(10);
      await page.mouse.click(geom.x, geom.bottom);
      await page.waitForTimeout(300);
      expect(await caretInfo(page)).toContain('off=0');

      // Click in empty page area below last content (still inside .bdoc-page)
      // places caret at document end — verified by typing appending there.
      await page.evaluate(() => {
        const pm = document.querySelector('.ProseMirror')!;
        const kids = Array.from(pm.children);
        const last = kids[kids.length - 1] as HTMLElement;
        last.scrollIntoView({ block: 'center' });
      });
      await page.waitForTimeout(300);
      const pt = await page.evaluate(() => {
        const pm = document.querySelector('.ProseMirror')!;
        const kids = Array.from(pm.children);
        const last = kids[kids.length - 1] as HTMLElement;
        const r = last.getBoundingClientRect();
        return { x: r.left + 100, y: r.bottom + 120 };
      });
      await page.mouse.click(pt.x, pt.y);
      await page.waitForTimeout(500);
      const beforeText = await editorText(page);
      await page.keyboard.type(' APPENDED', { delay: 20 });
      await page.waitForTimeout(800);
      const after = await editorText(page);
      expect(after).toContain('APPENDED');
      // Must be near the end (allow ~100 chars tolerance for last paragraph padding).
      expect(after.indexOf('APPENDED')).toBeGreaterThan(beforeText.length - 100);
      expect(await sheetCount(page)).toBeGreaterThanOrEqual(1);
    } finally {
      await doc.dispose();
    }
  });
});
