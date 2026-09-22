import { test, expect } from '@playwright/test';
import { API_URL, createDoc, getTestToken, login, loginWith, openEditor, openMenu } from './helpers';

const PW = 'E2ETest123!';

async function register(email: string, request: import('@playwright/test').APIRequestContext): Promise<void> {
  await request.post(`${API_URL}/auth/register`, { data: { email, password: PW } });
}

async function share(
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

async function clickPortalButton(page: import('@playwright/test').Page, startsWith: string): Promise<void> {
  await page.evaluate((label) => {
    const b = Array.from(document.querySelectorAll('button')).find(
      (x) => !x.closest('nav') && (x.textContent?.trim() ?? '').startsWith(label),
    ) as HTMLButtonElement | undefined;
    b?.click();
  }, startsWith);
  await page.waitForTimeout(400);
}

test.describe('suggestions', () => {
  test('validation: viewer forbidden, empty rejected, double accept 409, anonymous 401', async ({
    request,
  }) => {
    const headersA = { Authorization: `Bearer ${await getTestToken(request)}` };
    const doc = await createDoc(request, { title: 'E2E Sug V', content: '<p>Some suggestable text here.</p>' });
    const emailV = `e2e-sugv-${Date.now()}@bdoc.test`;
    try {
      await register(emailV, request);
      await share(request, doc.id, emailV, 'viewer');
      const loginV = await request.post(`${API_URL}/auth/login`, { data: { email: emailV, password: PW } });
      const headersV = { Authorization: `Bearer ${((await loginV.json()) as { token: string }).token}` };

      // Viewer cannot suggest.
      expect(
        (await request.post(`${API_URL}/documents/${doc.id}/suggestions`, {
          headers: headersV,
          data: { quote: 'text', replacement: 'words' },
        })).status(),
      ).toBe(403);
      // Empty quote/replacement rejected.
      expect(
        (await request.post(`${API_URL}/documents/${doc.id}/suggestions`, {
          headers: headersA,
          data: { quote: '', replacement: 'x' },
        })).status(),
      ).toBe(400);
      // Unknown suggestion id.
      expect(
        (await request.post(`${API_URL}/documents/${doc.id}/suggestions/00000000-0000-0000-0000-000000000000/accept`, {
          headers: headersA,
        })).status(),
      ).toBe(404);
      // Anonymous locked out.
      expect((await request.get(`${API_URL}/documents/${doc.id}/suggestions`)).status()).toBe(401);
      expect(
        (await request.post(`${API_URL}/documents/${doc.id}/suggestions`, {
          data: { quote: 'a', replacement: 'b' },
        })).status(),
      ).toBe(401);

      // Accept then accept again → 409.
      const s = (await (
        await request.post(`${API_URL}/documents/${doc.id}/suggestions`, {
          headers: headersA,
          data: { quote: 'suggestable', replacement: 'shared' },
        })
      ).json()) as { id: string };
      expect(
        (await request.post(`${API_URL}/documents/${doc.id}/suggestions/${s.id}/accept`, { headers: headersA })).status(),
      ).toBe(200);
      expect(
        (await request.post(`${API_URL}/documents/${doc.id}/suggestions/${s.id}/accept`, { headers: headersA })).status(),
      ).toBe(409);
      // Reject after accept → 409 as well.
      expect(
        (await request.post(`${API_URL}/documents/${doc.id}/suggestions/${s.id}/reject`, { headers: headersA })).status(),
      ).toBe(409);
    } finally {
      await doc.dispose();
    }
  });

  test('suggesting mode locks editing; suggest flow posts a card', async ({ page, request }) => {
    const doc = await createDoc(request, {
      title: 'E2E Sug Mode',
      content: '<p>Suggestable alpha words here.</p>',
    });
    const emailB = `e2e-sugb-${Date.now()}@bdoc.test`;
    try {
      await register(emailB, request);
      await share(request, doc.id, emailB, 'editor');
      await loginWith(page, request, emailB, PW);
      await openEditor(page, doc.id);

      // Select text while still editing…
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

      // …then switch to suggesting mode: editor locks, status shows it.
      await page.selectOption('.bdoc-scroll select[aria-label="Editing mode"]', 'suggesting');
      await page.waitForTimeout(600);
      expect(await page.evaluate(() => document.body.innerText.includes('Suggesting'))).toBe(true);
      expect(
        await page.evaluate(() => document.querySelector('.ProseMirror')?.getAttribute('contenteditable')),
      ).toBe('false');
      const before = await page.evaluate(() => document.querySelector('.ProseMirror')?.textContent ?? '');
      await page.keyboard.type('ZZZ', { delay: 20 });
      await page.waitForTimeout(500);
      expect(await page.evaluate(() => document.querySelector('.ProseMirror')?.textContent ?? '')).toBe(before);

      // Selection survived: suggest it.
      await page.click('.bdoc-scroll button[title="Suggest a change for the selected text"]');
      await page.waitForTimeout(600);
      expect(
        await page.evaluate(() => !!document.querySelector('[role="dialog"][aria-label="Suggest a change"]')),
      ).toBe(true);
      await page.fill('[aria-label="Proposed replacement"]', 'REPLACED');
      await clickPortalButton(page, 'Submit suggestion');
      await page.waitForTimeout(1000);
      // Submit opens the suggestions panel with the new card.
      expect(await page.evaluate(() => document.querySelector('[role="dialog"]')?.textContent ?? '')).toContain(
        'REPLACED',
      );
      await page.keyboard.press('Escape');
    } finally {
      await doc.dispose();
    }
  });

  test('owner accepts and rejects from the panel; content updates', async ({ page, request }) => {
    const doc = await createDoc(request, {
      title: 'E2E Sug Panel',
      content: '<p>Panel alpha words here.</p><p>Panel beta words here.</p>',
    });
    const emailB = `e2e-sugp-${Date.now()}@bdoc.test`;
    try {
      await register(emailB, request);
      await share(request, doc.id, emailB, 'editor');
      const headersA = { Authorization: `Bearer ${await getTestToken(request)}` };
      const s1 = (await (
        await request.post(`${API_URL}/documents/${doc.id}/suggestions`, {
          headers: headersA,
          data: { quote: 'alpha', replacement: 'ALPHA' },
        })
      ).json()) as { id: string };
      const s2 = (await (
        await request.post(`${API_URL}/documents/${doc.id}/suggestions`, {
          headers: headersA,
          data: { quote: 'beta', replacement: 'BETA' },
        })
      ).json()) as { id: string };
      expect(s1.id).toBeTruthy();
      expect(s2.id).toBeTruthy();
      expect(s1.id).not.toBe(s2.id);

      await login(page, request);
      await openEditor(page, doc.id);
      await openMenu(page, 'Tools');
      await clickPortalButton(page, 'Suggestions');
      await page.waitForTimeout(800);
      const dlg = '[role="dialog"][aria-label="Suggestions"]';
      expect(await page.evaluate(() => !!document.querySelector('[role="dialog"][aria-label="Suggestions"]'))).toBe(
        true,
      );

      // Accept the first: content updates, card flips to accepted.
      await page.evaluate(() => {
        const dlgEl = document.querySelector('[role="dialog"][aria-label="Suggestions"]')!;
        const btn = Array.from(dlgEl.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Accept') as HTMLButtonElement;
        btn.click();
      });
      await page.waitForTimeout(1200);
      expect(await page.evaluate(() => document.querySelector('[role="dialog"]')?.textContent ?? '')).toContain(
        'accepted',
      );
      const after = (await (await request.get(`${API_URL}/documents/${doc.id}`, { headers: headersA })).json()) as {
        content: string;
      };
      expect(after.content).toContain('ALPHA');
      expect(after.content).not.toContain('alpha words');

      // Reject the second: content untouched.
      await page.evaluate(() => {
        const dlgEl = document.querySelector('[role="dialog"][aria-label="Suggestions"]')!;
        const btns = Array.from(dlgEl.querySelectorAll('button')).filter((b) => b.textContent?.trim() === 'Reject');
        (btns[0] as HTMLButtonElement).click();
      });
      await page.waitForTimeout(1200);
      const after2 = (await (await request.get(`${API_URL}/documents/${doc.id}`, { headers: headersA })).json()) as {
        content: string;
      };
      expect(after2.content).toContain('beta words');
      expect(after2.content).not.toContain('BETA');
      await page.keyboard.press('Escape');
    } finally {
      await doc.dispose();
    }
  });
});
