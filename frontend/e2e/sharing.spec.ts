import { test, expect } from '@playwright/test';
import { API_URL, createDoc, getTestToken, login, loginWith, openEditor, openMenu } from './helpers';

const PW = 'E2ETest123!';

async function clickPortalButton(page: import('@playwright/test').Page, startsWith: string): Promise<void> {
  await page.evaluate((label) => {
    const b = Array.from(document.querySelectorAll('button')).find(
      (x) => !x.closest('nav') && (x.textContent?.trim() ?? '').startsWith(label),
    ) as HTMLButtonElement | undefined;
    b?.click();
  }, startsWith);
  await page.waitForTimeout(400);
}

async function shareAsOwner(
  request: import('@playwright/test').APIRequestContext,
  docId: string,
  email: string,
  permission: string,
): Promise<void> {
  const headers = { Authorization: `Bearer ${await getTestToken(request)}` };
  const res = await request.post(`${API_URL}/documents/${docId}/shares`, {
    headers,
    data: { email, permission },
  });
  expect(res.ok()).toBeTruthy();
}

test.describe('document sharing UI', () => {
  test('owner shares via Tools menu dialog and sees errors', async ({ page, request }) => {
    const doc = await createDoc(request, { title: 'E2E Share UI', content: '<p>share me</p>' });
    const emailB = `e2e-share-ui-${Date.now()}@bdoc.test`;
    try {
      // Target user must exist (registration is a separate step, as in prod).
      await request.post(`${API_URL}/auth/register`, { data: { email: emailB, password: PW } });
      await login(page, request);
      await openEditor(page, doc.id);
      await openMenu(page, 'Tools');
      await clickPortalButton(page, 'Share');
      await page.waitForTimeout(600);
      expect(await page.evaluate(() => !!document.querySelector('[role="dialog"][aria-label="Share document"]'))).toBe(true);
      expect(await page.evaluate(() => document.querySelector('[role="dialog"]')?.textContent ?? '')).toContain('Only you');
      await page.fill('[aria-label="Email to share with"]', emailB);
      await page.selectOption('[aria-label="Permission"]', 'viewer');
      await clickPortalButton(page, 'Share');
      await page.waitForTimeout(800);
      expect(await page.evaluate(() => document.querySelector('[role="dialog"]')?.textContent ?? '')).toContain(emailB);
      // Unknown user shows an error, dialog stays open.
      await page.fill('[aria-label="Email to share with"]', 'nobody-here@bdoc.test');
      await clickPortalButton(page, 'Share');
      await page.waitForTimeout(800);
      expect(await page.evaluate(() => document.querySelector('[role="dialog"]')?.textContent ?? '')).toContain('No user');
      await page.keyboard.press('Escape');
    } finally {
      await doc.dispose();
    }
  });

  test('viewer gets a read-only editor and stays logged in', async ({ page, request }) => {
    const doc = await createDoc(request, { title: 'E2E View Only', content: '<p>look but touch</p>' });
    const emailB = `e2e-viewer-${Date.now()}@bdoc.test`;
    try {
      await loginWith(page, request, emailB, PW);
      await shareAsOwner(request, doc.id, emailB, 'viewer');
      await openEditor(page, doc.id);
      expect(await page.evaluate(() => document.body.innerText.includes('View only'))).toBe(true);
      expect(await page.evaluate(() => document.querySelector('.ProseMirror')?.getAttribute('contenteditable'))).toBe('false');
      expect(
        await page.evaluate(
          () => (document.querySelector('input[aria-label="Document title"]') as HTMLInputElement)?.readOnly,
        ),
      ).toBe(true);
      // No Share item in the Tools menu for non-owners.
      await openMenu(page, 'Tools');
      const hasShare = await page.evaluate(() =>
        Array.from(document.querySelectorAll('button')).some(
          (x) => !x.closest('nav') && (x.textContent?.trim() ?? '').startsWith('Share'),
        ),
      );
      expect(hasShare).toBe(false);
      await page.keyboard.press('Escape');
      // No autosave-403 logout: still on the editor after throttle windows.
      await page.waitForTimeout(4000);
      expect(page.url()).toContain(`/editor/${doc.id}`);
      expect(await page.evaluate(() => document.querySelector('.ProseMirror')?.textContent ?? '')).toContain(
        'look but touch',
      );
    } finally {
      await doc.dispose();
    }
  });

  test('editor-shared user can edit and autosave persists', async ({ page, request }) => {
    const doc = await createDoc(request, { title: 'E2E Shared Edit', content: '<p>Edit base.</p>' });
    const emailC = `e2e-editor-${Date.now()}@bdoc.test`;
    try {
      await loginWith(page, request, emailC, PW);
      await shareAsOwner(request, doc.id, emailC, 'editor');
      await openEditor(page, doc.id);
      expect(await page.evaluate(() => document.body.innerText.includes('View only'))).toBe(false);
      const pt = await page.evaluate(() => {
        const p = document.querySelector('.ProseMirror p') as HTMLElement;
        p.scrollIntoView({ block: 'center' });
        const r = p.getBoundingClientRect();
        return { x: r.left + r.width - 20, y: r.top + r.height / 2 };
      });
      await page.mouse.click(pt.x, pt.y);
      await page.keyboard.press('End');
      await page.keyboard.type(' More from C.', { delay: 20 });
      // Autosave throttle (1.5s) + margin.
      await page.waitForTimeout(3500);
      const headersA = { Authorization: `Bearer ${await getTestToken(request)}` };
      let srv: { content: string } | null = null;
      for (let i = 0; i < 10; i++) {
        const res = await request.get(`${API_URL}/documents/${doc.id}`, { headers: headersA });
        if (res.ok()) {
          srv = (await res.json()) as { content: string };
          if (srv.content.includes('More from C.')) break;
        }
        await page.waitForTimeout(600);
      }
      expect(srv?.content ?? '').toContain('More from C.');
    } finally {
      await doc.dispose();
    }
  });
});
