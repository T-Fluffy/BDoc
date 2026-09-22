import { test, expect } from '@playwright/test';
import { API_URL, createDoc, getTestToken, login, loginWith, openEditor } from './helpers';

const PW = 'E2ETest123!';

test.describe('realtime collaboration', () => {
  test('presence and live cursor between two users', async ({ browser, request }) => {
    const doc = await createDoc(request, {
      title: 'E2E Collab',
      content: '<p>Collab paragraph one.</p><p>Second paragraph here.</p>',
    });
    const emailB = `e2e-collab-${Date.now()}@bdoc.test`;
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();
    try {
      // B must exist before it can be shared with.
      await request.post(`${API_URL}/auth/register`, { data: { email: emailB, password: PW } });
      const headersA = { Authorization: `Bearer ${await getTestToken(request)}` };
      const share = await request.post(`${API_URL}/documents/${doc.id}/shares`, {
        headers: headersA,
        data: { email: emailB, permission: 'editor' },
      });
      expect(share.ok()).toBeTruthy();

      await login(pageA, request);
      await loginWith(pageB, request, emailB, PW);
      await openEditor(pageA, doc.id);
      await openEditor(pageB, doc.id);

      // Each side sees the other in presence.
      await expect(pageA.locator(`[data-testid="presence"] [data-email="${emailB}"]`)).toBeVisible({
        timeout: 20000,
      });
      await expect(pageB.locator('[data-testid="presence"] [data-email="e2e@bdoc.test"]')).toBeVisible({
        timeout: 20000,
      });

      // B clicks into text → A sees B's remote cursor flag.
      const pt = await pageB.evaluate(() => {
        const p = document.querySelector('.ProseMirror p') as HTMLElement;
        p.scrollIntoView({ block: 'center' });
        const r = p.getBoundingClientRect();
        return { x: r.left + 60, y: r.top + r.height / 2 };
      });
      await pageB.mouse.click(pt.x, pt.y);
      await expect(pageA.locator(`.remote-cursor-flag[data-email="${emailB}"]`)).toBeVisible({
        timeout: 20000,
      });

      // B selects a range → A sees the remote selection highlight.
      await pageB.keyboard.down('Shift');
      for (let i = 0; i < 5; i++) await pageB.keyboard.press('ArrowRight');
      await pageB.keyboard.up('Shift');
      await expect(pageA.locator('.remote-selection')).toBeVisible({ timeout: 20000 });

      // Nobody got logged out by realtime traffic.
      expect(pageA.url()).toContain(`/editor/${doc.id}`);
      expect(pageB.url()).toContain(`/editor/${doc.id}`);
    } finally {
      await ctxA.close().catch(() => undefined);
      await ctxB.close().catch(() => undefined);
      await doc.dispose();
    }
  });

  test('revoked user cannot join the room', async ({ browser, request }) => {    const doc = await createDoc(request, { title: 'E2E Collab Lock', content: '<p>locked</p>' });
    const emailB = `e2e-collab-lock-${Date.now()}@bdoc.test`;
    const ctxB = await browser.newContext();
    const pageB = await ctxB.newPage();
    try {
      await request.post(`${API_URL}/auth/register`, { data: { email: emailB, password: PW } });
      await loginWith(pageB, request, emailB, PW);
      await pageB.goto(`/editor/${doc.id}`);
      await pageB.waitForTimeout(4000);
      // Access denied: error shown, never joined — no presence, no remote flags.
      expect(await pageB.evaluate(() => document.body.innerText.includes('Document not found'))).toBe(true);
      expect(await pageB.locator('[data-testid="presence"] [data-email]').count()).toBe(0);
      expect(await pageB.locator('.remote-cursor-flag').count()).toBe(0);
    } finally {
      await ctxB.close().catch(() => undefined);
      await doc.dispose();
    }
  });

  test('viewer sees owner edits live without reload', async ({ browser, request }) => {
    const doc = await createDoc(request, {
      title: 'E2E Live View',
      content: '<p>Live base text.</p>',
    });
    const emailB = `e2e-liveview-${Date.now()}@bdoc.test`;
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();
    try {
      await request.post(`${API_URL}/auth/register`, { data: { email: emailB, password: PW } });
      const headersA = { Authorization: `Bearer ${await getTestToken(request)}` };
      await request.post(`${API_URL}/documents/${doc.id}/shares`, {
        headers: headersA,
        data: { email: emailB, permission: 'viewer' },
      });
      await login(pageA, request);
      await loginWith(pageB, request, emailB, PW);
      await openEditor(pageA, doc.id);
      await openEditor(pageB, doc.id);

      const pt = await pageA.evaluate(() => {
        const p = document.querySelector('.ProseMirror p') as HTMLElement;
        p.scrollIntoView({ block: 'center' });
        const r = p.getBoundingClientRect();
        return { x: r.left + r.width - 30, y: r.top + r.height / 2 };
      });
      await pageA.mouse.click(pt.x, pt.y);
      await pageA.keyboard.press('End');
      await pageA.keyboard.type(' LIVEONE', { delay: 20 });
      // Owner autosave (1.5s) + notify + viewer re-fetch.
      await expect
        .poll(
          async () => pageB.evaluate(() => document.querySelector('.ProseMirror')?.textContent ?? ''),
          { timeout: 20000 },
        )
        .toContain('LIVEONE');
      // Viewers auto-apply: no banner, no redirect.
      expect(await pageB.locator('[data-testid="update-banner"]').count()).toBe(0);
      expect(pageB.url()).toContain(`/editor/${doc.id}`);
    } finally {
      await ctxA.close().catch(() => undefined);
      await ctxB.close().catch(() => undefined);
      await doc.dispose();
    }
  });

  test('dirty editor gets an update banner and reload applies', async ({ browser, request }) => {
    const doc = await createDoc(request, {
      title: 'E2E Live Dirty',
      content: '<p>Dirty base text.</p>',
    });
    const emailC = `e2e-livedirty-${Date.now()}@bdoc.test`;
    const ctxA = await browser.newContext();
    const ctxC = await browser.newContext();
    const pageA = await ctxA.newPage();
    const pageC = await ctxC.newPage();
    try {
      await request.post(`${API_URL}/auth/register`, { data: { email: emailC, password: PW } });
      const headersA = { Authorization: `Bearer ${await getTestToken(request)}` };
      await request.post(`${API_URL}/documents/${doc.id}/shares`, {
        headers: headersA,
        data: { email: emailC, permission: 'editor' },
      });
      await login(pageA, request);
      await loginWith(pageC, request, emailC, PW);
      await openEditor(pageA, doc.id);
      await openEditor(pageC, doc.id);

      // C's saves fail (blocked PUT) so C stays dirty.
      await pageC.route('**/api/documents/**', (route) =>
        route.request().method() === 'PUT' ? route.abort() : route.continue(),
      );
      const ptC = await pageC.evaluate(() => {
        const p = document.querySelector('.ProseMirror p') as HTMLElement;
        p.scrollIntoView({ block: 'center' });
        const r = p.getBoundingClientRect();
        return { x: r.left + r.width - 30, y: r.top + r.height / 2 };
      });
      await pageC.mouse.click(ptC.x, ptC.y);
      await pageC.keyboard.press('End');
      await pageC.keyboard.type(' CDIRTY', { delay: 20 });
      await pageC.waitForTimeout(2500);

      // A saves a competing edit.
      const ptA = await pageA.evaluate(() => {
        const p = document.querySelector('.ProseMirror p') as HTMLElement;
        p.scrollIntoView({ block: 'center' });
        const r = p.getBoundingClientRect();
        return { x: r.left + r.width - 30, y: r.top + r.height / 2 };
      });
      await pageA.mouse.click(ptA.x, ptA.y);
      await pageA.keyboard.press('End');
      await pageA.keyboard.type(' AWINNER', { delay: 20 });
      await expect
        .poll(async () => {
          const res = await request.get(`${API_URL}/documents/${doc.id}`, { headers: headersA });
          if (!res.ok()) return '';
          return ((await res.json()) as { content: string }).content;
        }, { timeout: 15000 })
        .toContain('AWINNER');

      // Dirty C gets the banner instead of a silent overwrite.
      await expect(pageC.locator('[data-testid="update-banner"]')).toBeVisible({ timeout: 20000 });
      expect(await pageC.evaluate(() => document.querySelector('.ProseMirror')?.textContent ?? '')).toContain(
        'CDIRTY',
      );
      await pageC.locator('[data-testid="update-banner"] button:has-text("Reload")').click();
      await expect
        .poll(async () => pageC.evaluate(() => document.querySelector('.ProseMirror')?.textContent ?? ''), {
          timeout: 10000,
        })
        .toContain('AWINNER');
    } finally {
      await ctxA.close().catch(() => undefined);
      await ctxC.close().catch(() => undefined);
      await doc.dispose();
    }
  });
});
