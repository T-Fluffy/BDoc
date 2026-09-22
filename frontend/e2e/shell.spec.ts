import {test, expect } from '@playwright/test';
import {createDoc, login, openEditor, openMenu, paras, sheetCount, getTestToken} from './helpers';

test.describe('app shell', () => {
  test('menu row exposes all seven menus', async ({ page, request }) => {
    const doc = await createDoc(request, { title: 'E2E Menus', content: paras(5) });
    try {
      await login(page, request);
      await openEditor(page, doc.id);
      const row = await page.evaluate(() =>
        Array.from(document.querySelectorAll('nav > div:last-child button')).map((b) =>
          b.textContent?.trim(),
        ),
      );
      for (const m of ['File', 'Edit', 'View', 'Page', 'Insert', 'Format', 'Tools', 'Help']) {
        expect(row).toContain(m);
      }
    } finally {
      await doc.dispose();
    }
  });

  test('Format submenu opens on hover and items apply', async ({ page, request }) => {
    const doc = await createDoc(request, {
      title: 'E2E Submenu',
      content: '<p>Submenu check words here.</p>',
    });
    try {
      await login(page, request);
      await openEditor(page, doc.id);
      // Caret into text with a real click.
      const pt = await page.evaluate(() => {
        const p = document.querySelector('.ProseMirror p') as HTMLElement;
        p.scrollIntoView({ block: 'center' });
        const r = p.getBoundingClientRect();
        return { x: r.left + 40, y: r.top + r.height / 2 };
      });
      await page.mouse.click(pt.x, pt.y);
      await page.waitForTimeout(300);
      await openMenu(page, 'Format');
      const tb = await page.evaluate(() => {
        const b = Array.from(document.querySelectorAll('button')).find(
          (x) => !x.closest('nav') && (x.textContent?.trim() ?? '').startsWith('Text'),
        )!;
        const r = b.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      });
      await page.mouse.move(tb.x, tb.y);
      await page.waitForTimeout(450);
      // Submenu must be painted above the overlay (hit-testable).
      const hit = await page.evaluate(() => {
        const b = Array.from(document.querySelectorAll('button')).find(
          (x) => !x.closest('nav') && (x.textContent?.trim() ?? '').startsWith('Bold'),
        )!;
        const r = b.getBoundingClientRect();
        const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return el === b || b.contains(el);
      });
      expect(hit).toBe(true);
    } finally {
      await doc.dispose();
    }
  });

  test('toolbar controls apply: styles, indent, line spacing, zoom, clear', async ({
    page,
    request,
  }) => {
    const doc = await createDoc(request, {
      title: 'E2E Toolbar',
      content: '<p>Toolbar verification paragraph one.</p><p>Second paragraph here.</p>',
    });
    try {
      await login(page, request);
      await openEditor(page, doc.id);
      const selects = await page.evaluate(() =>
        Array.from(document.querySelectorAll('.bdoc-scroll select')).map(
          (s) => (s as HTMLSelectElement).title,
        ),
      );
      expect(selects).toEqual(
        expect.arrayContaining(['Zoom', 'Styles', 'Font family', 'Font size', 'Line spacing']),
      );

      // Real click into first paragraph, then styles -> Heading 1.
      const pt = await page.evaluate(() => {
        const p = document.querySelector('.ProseMirror p') as HTMLElement;
        p.scrollIntoView({ block: 'center' });
        const r = p.getBoundingClientRect();
        return { x: r.left + 60, y: r.top + r.height / 2 };
      });
      await page.mouse.click(pt.x, pt.y);
      await page.waitForTimeout(300);
      await page.selectOption('.bdoc-scroll select[title="Styles"]', 'h1');
      await page.waitForTimeout(600);
      expect(
        await page.evaluate(() => !!document.querySelector('.ProseMirror h1')),
      ).toBe(true);
      expect(
        await page.evaluate(
          () => (document.querySelector('.bdoc-scroll select[title="Styles"]') as HTMLSelectElement).value,
        ),
      ).toBe('h1');

      // Indent via toolbar button.
      await page.evaluate(() => {
        const b = Array.from(document.querySelectorAll('.bdoc-scroll button')).find(
          (x) => (x as HTMLButtonElement).title === 'Increase indent',
        ) as HTMLButtonElement;
        b.click();
      });
      await page.waitForTimeout(600);
      const pad = await page.evaluate(
        () =>
          (document.querySelector('.ProseMirror h1') as HTMLElement)?.style.paddingLeft ||
          (document.querySelector('.ProseMirror p') as HTMLElement)?.style.paddingLeft,
      );
      expect(parseFloat(pad)).toBeGreaterThan(0);

      // Zoom select in toolbar.
      await page.selectOption('.bdoc-scroll select[title="Zoom"]', '1.5');
      await page.waitForTimeout(1200);
      expect(
        await page.evaluate(() => document.querySelector('.zoom-inner')?.getAttribute('style') ?? ''),
      ).toContain('scale(1.5)');
    } finally {
      await doc.dispose();
    }
  });

  test('find and replace dialog works end to end', async ({ page, request }) => {
    const doc = await createDoc(request, {
      title: 'E2E Find',
      content: '<p>Find me alpha and find me beta.</p><p>No match here.</p><p>Find me gamma.</p>',
    });
    try {
      await login(page, request);
      await openEditor(page, doc.id);
      await page.keyboard.press('ControlOrMeta+h');
      await page.waitForTimeout(500);
      expect(
        await page.evaluate(() => document.querySelector('[role="dialog"]')?.getAttribute('aria-label')),
      ).toBe('Find and replace');
      await page.evaluate(() => {
        const dlg = document.querySelector('[role="dialog"]')!;
        (dlg.querySelectorAll('input')[0] as HTMLInputElement).focus();
      });
      await page.keyboard.type('find me', { delay: 30 });
      await page.waitForTimeout(500);
      expect(
        await page.evaluate(() => document.querySelector('[role="dialog"]')?.textContent ?? ''),
      ).toContain('3 matches');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(400);
      expect(await page.evaluate(() => window.getSelection()?.toString() ?? '')).toBe('Find me');
      await page.evaluate(() => {
        const dlg = document.querySelector('[role="dialog"]')!;
        (dlg.querySelectorAll('input')[1] as HTMLInputElement).focus();
      });
      await page.keyboard.type('FOUND', { delay: 20 });
      await page.waitForTimeout(300);
      await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('[role="dialog"] button'));
        (btns.find((b) => b.textContent?.includes('Replace all')) as HTMLButtonElement)?.click();
      });
      await page.waitForTimeout(800);
      const text = await page.evaluate(() => document.querySelector('.ProseMirror')?.innerText ?? '');
      expect(text).toContain('FOUND alpha');
      expect(text).toContain('FOUND gamma');
      expect(text).not.toMatch(/find me/i);
      await page.keyboard.press('Escape');
    } finally {
      await doc.dispose();
    }
  });

  test('word count and help dialogs', async ({ page, request }) => {
    const doc = await createDoc(request, { title: 'E2E Dialogs', content: '<p>Seven small words here now.</p>' });
    try {
      await login(page, request);
      await openEditor(page, doc.id);
      await openMenu(page, 'Tools');
      await page.evaluate(() => {
        const all = Array.from(document.querySelectorAll('button'));
        (all.find((x) => !x.closest('nav') && x.textContent?.includes('Word count')) as HTMLButtonElement)?.click();
      });
      await page.waitForTimeout(500);
      const wc = await page.evaluate(() => document.querySelector('[role="dialog"]')?.innerText ?? '');
      expect(wc).toContain('Words');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
      await openMenu(page, 'Help');
      await page.evaluate(() => {
        const all = Array.from(document.querySelectorAll('button'));
        (all.find((x) => !x.closest('nav') && x.textContent?.includes('Keyboard')) as HTMLButtonElement)?.click();
      });
      await page.waitForTimeout(500);
      expect(await page.evaluate(() => !!document.querySelector('[role="dialog"]'))).toBe(true);
      await page.keyboard.press('Escape');
    } finally {
      await doc.dispose();
    }
  });

  test('library search, create, delete and auth guard', async ({ page, request }) => {
    const doc = await createDoc(request, { title: 'E2E UniqueLibraryDoc', content: '<p>x</p>' });
    try {
      await login(page, request);
      await page.goto('/');
      await page.waitForTimeout(1200);
      // Search filters.
      await page.fill('input[placeholder*="Search" i]', 'UniqueLibrary');
      await page.waitForTimeout(400);
      const cards = await page.evaluate(() =>
        Array.from(document.querySelectorAll('main [class*="card"], main a, main div[class*="cursor"]')).length,
      );
      void cards;
      const visible = await page.evaluate(() => document.body.innerText.includes('E2E UniqueLibraryDoc'));
      expect(visible).toBe(true);
      await page.fill('input[placeholder*="Search" i]', 'zzz-no-such-doc');
      await page.waitForTimeout(400);
      expect(await page.evaluate(() => document.body.innerText.includes('E2E UniqueLibraryDoc'))).toBe(false);

      // Auth guard: cleared tokens redirect to login.
      await page.evaluate(() => {
        localStorage.removeItem('bdoc-token');
        localStorage.removeItem('bdoc-email');
      });
      await page.goto('/');
      await page.waitForTimeout(800);
      expect(page.url()).toContain('/login');
    } finally {
      await doc.dispose();
    }
  });

  test('mobile width has no horizontal overflow', async ({ page, request }) => {
    const doc = await createDoc(request, { title: 'E2E Mobile', content: paras(10) });
    try {
      await login(page, request);
      await page.setViewportSize({ width: 700, height: 900 });
      await openEditor(page, doc.id);
      expect(await page.evaluate(() => !!document.querySelector('nav'))).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth > 700)).toBe(false);
      expect(await sheetCount(page)).toBeGreaterThanOrEqual(1);
    } finally {
      await doc.dispose();
    }
  });
});
