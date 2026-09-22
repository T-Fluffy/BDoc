import { test, expect } from '@playwright/test';
import { API_URL, createDoc, getTestToken, login, openEditor, openMenu } from './helpers';

const RICH_HTML =
  '<h1>MD Head</h1>' +
  '<h2>MD Sub</h2>' +
  '<p>Hello <strong>bold</strong> and <em>ital</em> with <s>strike</s> and <code>code</code>.</p>' +
  '<p>See <a href="https://example.com">Link text</a>.</p>' +
  '<ul><li>One</li><li>Two<ul><li>Nested</li></ul></li></ul>' +
  '<ol><li>First</li><li>Second</li></ol>' +
  '<blockquote><p>Quoted words here.</p></blockquote>' +
  '<pre><code>var x = 1;</code></pre>' +
  '<table><tbody><tr><td>R1C1</td><td>R1C2</td></tr><tr><td>R2C1</td><td>R2C2</td></tr></tbody></table>' +
  '<hr/>' +
  '<div class="page-break" data-page-break="true" data-user-break="true" style="height: 100px"></div>' +
  '<p>After break.</p>';

async function exportMd(request: import('@playwright/test').APIRequestContext, id: string): Promise<{ text: string; type: string; disp: string }> {
  const headers = { Authorization: `Bearer ${await getTestToken(request)}` };
  const res = await request.get(`${API_URL}/documents/${id}/export/markdown`, { headers });
  expect(res.ok()).toBeTruthy();
  return {
    text: await res.text(),
    type: res.headers()['content-type'] ?? '',
    disp: res.headers()['content-disposition'] ?? '',
  };
}

async function importMd(request: import('@playwright/test').APIRequestContext, buf: Buffer, name: string): Promise<{ html: string }> {
  const headers = { Authorization: `Bearer ${await getTestToken(request)}` };
  const res = await request.post(`${API_URL}/documents/import/markdown`, {
    headers,
    multipart: { file: { name, mimeType: 'text/markdown', buffer: buf } },
  });
  expect(res.ok()).toBeTruthy();
  return (await res.json()) as { html: string };
}

test.describe('markdown round-trip', () => {
  test('export emits GFM: headings, marks, lists, quote, code, table, rule, break', async ({ request }) => {
    const doc = await createDoc(request, { title: 'E2E MDX', content: RICH_HTML });
    try {
      const { text, type, disp } = await exportMd(request, doc.id);
      expect(type).toContain('text/markdown');
      expect(disp).toContain('.md');
      expect(text).toContain('# MD Head');
      expect(text).toContain('## MD Sub');
      expect(text).toContain('**bold**');
      expect(text).toContain('*ital*');
      expect(text).toContain('~~strike~~');
      expect(text).toContain('`code`');
      expect(text).toContain('[Link text](https://example.com)');
      expect(text).toContain('- One');
      expect(text).toContain('  - Nested');
      expect(text).toContain('1. First');
      expect(text).toContain('> Quoted words here.');
      expect(text).toContain('```');
      expect(text).toContain('var x = 1;');
      expect(text).toContain('| R1C1 | R1C2 |');
      expect(text).toContain('| --- | --- |');
      expect(text).toContain('| R2C1 | R2C2 |');
      expect(text).toContain('---');
      expect(text).toContain('<!-- page-break -->');
      expect(text).toContain('After break.');
    } finally {
      await doc.dispose();
    }
  });

  test('import restores headings, marks, tasks, table, code, break', async ({ request }) => {
    const { readFileSync } = await import('node:fs');
    const { join, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const dir = dirname(fileURLToPath(import.meta.url));
    const { html } = await importMd(request, readFileSync(join(dir, 'fixtures', 'sample.md')), 'sample.md');
    expect(html).toContain('<h1');
    expect(html).toContain('Fixture Doc');
    expect(html).toContain('<h2');
    expect(html).toContain('<strong>bold words</strong>');
    expect(html).toContain('<em>italic words</em>');
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('Finished chore');
    expect(html).toContain('<ol>');
    expect(html).toContain('<blockquote>');
    expect(html).toContain('language-ts');
    expect(html).toContain('const answer = 42;');
    expect(html).toContain('<table>');
    expect(html).toContain('Cairo');
    expect(html).toContain('<hr');
    expect(html).toContain('data-user-break="true"');
    expect(html).toContain('After the break runs here.');
  });

  test('export then import preserves text and structure', async ({ request }) => {
    const doc = await createDoc(request, { title: 'E2E MDRT', content: RICH_HTML });
    try {
      const { text } = await exportMd(request, doc.id);
      const { html } = await importMd(request, Buffer.from(text, 'utf8'), 'roundtrip.md');
      for (const needle of ['MD Head', 'bold', 'Nested', 'Quoted words here.', 'var x = 1;', 'R2C2', 'Link text', 'After break.']) {
        expect(html).toContain(needle);
      }
      expect(html).toContain('data-user-break="true"');
    } finally {
      await doc.dispose();
    }
  });

  test('import validation: empty 400, anonymous 401', async ({ request }) => {
    const headers = { Authorization: `Bearer ${await getTestToken(request)}` };
    const empty = await request.post(`${API_URL}/documents/import/markdown`, {
      headers,
      multipart: { file: { name: 'empty.md', mimeType: 'text/markdown', buffer: Buffer.alloc(0) } },
    });
    expect(empty.status()).toBe(400);
    const anonImp = await request.post(`${API_URL}/documents/import/markdown`, {
      multipart: { file: { name: 'x.md', mimeType: 'text/markdown', buffer: Buffer.from('# hi', 'utf8') } },
    });
    expect(anonImp.status()).toBe(401);
    expect((await request.get(`${API_URL}/documents/00000000-0000-0000-0000-000000000000/export/markdown`)).status()).toBe(401);
  });

  test('UI: file menu lists markdown items and import flow works', async ({ page, request }) => {
    const doc = await createDoc(request, { title: 'E2E MD UI', content: '<p>seed</p>' });
    try {
      await login(page, request);
      await openEditor(page, doc.id);
      await openMenu(page, 'File');
      const items = await page.evaluate(() =>
        Array.from(document.querySelectorAll('button'))
          .filter((x) => !x.closest('nav'))
          .map((x) => x.textContent?.trim() ?? ''),
      );
      expect(items).toContain('Import Markdown (.md)');
      expect(items).toContain('Download as Markdown (.md)');
      await page.keyboard.press('Escape');
      // Upload the md fixture through the markdown file input.
      const { join, dirname } = await import('node:path');
      const { fileURLToPath } = await import('node:url');
      const dir = dirname(fileURLToPath(import.meta.url));
      await page.setInputFiles('input[accept*="markdown"]', join(dir, 'fixtures', 'sample.md'));
      await page.waitForFunction((old: string) => !window.location.pathname.endsWith(old), doc.id, {
        timeout: 30000,
      }).catch(() => undefined);
      const newId = page.url().split('/').pop()!;
      expect(newId).not.toBe(doc.id);
      await page.waitForSelector('.ProseMirror', { timeout: 30000 });
      await page.waitForTimeout(3000);
      const headers = { Authorization: `Bearer ${await getTestToken(request)}` };
      const created = (await (await request.get(`${API_URL}/documents/${newId}`, { headers })).json()) as {
        title: string;
        content: string;
      };
      expect(created.title).toBe('sample');
      expect(created.content).toContain('Fixture Doc');
      expect(created.content).toContain('Finished chore');
      await request.delete(`${API_URL}/documents/${newId}`, { headers }).catch(() => undefined);
    } finally {
      await doc.dispose();
    }
  });
});
