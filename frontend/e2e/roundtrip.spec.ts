import AdmZip from 'adm-zip';
import { test, expect } from '@playwright/test';
import { API_URL, createDoc, getTestToken, login, openEditor, sheetCount } from './helpers';

const HF_SETTINGS = JSON.stringify({
  size: 'A4',
  orientation: 'landscape',
  margins: 'wide',
  headerFooter: {
    header: { default: 'RT Header Default', first: 'RT Header First', even: '' },
    footer: { default: 'RT Footer Default', first: '', even: '' },
    differentFirstPage: true,
    differentOddEven: true,
    pageNumbersEnabled: true,
    pageNumberAlign: 'right',
  },
});

async function exportDocx(request: import('@playwright/test').APIRequestContext, id: string): Promise<Buffer> {
  const res = await request.get(`${API_URL}/documents/${id}/export`, {
    headers: { Authorization: `Bearer ${await getTestToken(request)}` },
  });
  expect(res.ok()).toBeTruthy();
  expect(res.headers()['content-type']).toContain(
    'officedocument.wordprocessingml.document',
  );
  return Buffer.from(await res.body());
}

function docXml(buf: Buffer): string {
  const zip = new AdmZip(buf);
  return zip.readAsText(zip.getEntry('word/document.xml')!);
}

async function importDocx(request: import('@playwright/test').APIRequestContext, buf: Buffer, name: string) {
  const fd = new FormData();
  fd.append('file', new Blob([new Uint8Array(buf)], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  }), name);
  const imp = await fetch(`${API_URL}/documents/import`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await getTestToken(request)}` },
    body: fd,
  });
  expect(imp.ok).toBeTruthy();
  return imp.json();
}

test.describe('docx round-trip', () => {
  test('export emits headers, footers, fields, page setup; import restores them', async ({
    request,
  }) => {
    const doc = await createDoc(request, {
      title: 'E2E RT',
      content: '<p>Round trip body paragraph one.</p><p>Round trip body paragraph two.</p>',
      settings: HF_SETTINGS,
    });
    try {
      const buf = await exportDocx(request, doc.id);
      const xml = docXml(buf);

      // Headers: default + first parts exist with text (parts are separate files, not document.xml).
      const zip = new AdmZip(buf);
      const parts = zip.getEntries().map((e) => e.entryName);
      expect(parts.some((p) => p.startsWith('word/header'))).toBe(true);
      expect(parts.some((p) => p.startsWith('word/footer'))).toBe(true);
      const headerTexts = zip
        .getEntries()
        .filter((e) => e.entryName.startsWith('word/header'))
        .map((e) => zip.readAsText(e))
        .join(' ');
      expect(headerTexts).toContain('RT Header Default');
      expect(headerTexts).toContain('RT Header First');
      // Footers carry live PAGE/NUMPAGES fields (also in part files, not document.xml).
      const footerTexts = zip
        .getEntries()
        .filter((e) => e.entryName.startsWith('word/footer'))
        .map((e) => zip.readAsText(e))
        .join(' ');
      expect(footerTexts).toMatch(/w:instr=" PAGE "/);
      expect(footerTexts).toMatch(/w:instr=" NUMPAGES "/);
      // Section refs + flags.
      expect(xml).toContain('w:type="first"');
      expect(xml).toContain('<w:titlePg');
      expect(xml).toContain('evenAndOddHeaders');
      // Landscape A4 + wide margins took effect (case-insensitive binding).
      expect(xml).toMatch(/w:pgSz[^>]*w:orient="landscape"/);
      expect(xml).toMatch(/w:top="1701"/); // 30mm wide margins in twips

      // Import it back: body clean, settings identical (fixed point).
      const imported = await importDocx(request, buf, 'rt.docx');
      expect(imported.html).toContain('Round trip body paragraph one.');
      expect(imported.html).not.toMatch(/RT Header|RT Footer|Page \d+ of/);
      const s = typeof imported.settings === 'string' ? JSON.parse(imported.settings) : imported.settings;
      expect(s.orientation).toBe('landscape');
      expect(s.margins).toBe('wide');
      expect(s.headerFooter.header.default).toBe('RT Header Default');
      expect(s.headerFooter.header.first).toBe('RT Header First');
      expect(s.headerFooter.footer.default).toBe('RT Footer Default');
      // Variant parts created only for page numbers carry no baked text.
      expect(s.headerFooter.footer.first).toBe('');
      expect(s.headerFooter.footer.even).toBe('');
      expect(s.headerFooter.differentFirstPage).toBe(true);
      expect(s.headerFooter.differentOddEven).toBe(true);
      expect(s.headerFooter.pageNumbersEnabled).toBe(true);
      expect(s.headerFooter.pageNumberAlign).toBe('right');
    } finally {
      await doc.dispose();
    }
  });

  test('user page breaks export as real Word breaks', async ({ request }) => {
    const doc = await createDoc(request, {
      title: 'E2E UB',
      content:
        '<p>Before.</p><div class="page-break" data-page-break="true" data-user-break="true" style="height: 100px"></div><p>After.</p>',
    });
    try {
      const xml = docXml(await exportDocx(request, doc.id));
      expect(xml).toMatch(/w:type="page"/);
      expect(xml).not.toContain('data-user-break');
    } finally {
      await doc.dispose();
    }
  });

  test('tab stops round-trip exactly', async ({ request }) => {
    const doc = await createDoc(request, {
      title: 'E2E Tabs',
      content: '<p data-tab-stops="25,50">Name Adler Age.</p><p>Plain.</p>',
    });
    try {
      const xml = docXml(await exportDocx(request, doc.id));
      expect(xml).toMatch(/<w:tabs>.*<\/w:tabs>/);
      expect(xml).toContain('w:pos="1417"'); // 25mm in twips
      expect(xml).toContain('w:pos="2835"'); // 50mm in twips
      const buf = await exportDocx(request, doc.id);
      const imported = await importDocx(request, buf, 't.docx');
      expect(imported.html).toContain('data-tab-stops="25,50"');
    } finally {
      await doc.dispose();
    }
  });

  test('foreign fixture: w:tabs import', async ({ request }) => {
    const { readFileSync } = await import('node:fs');
    const { join, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const dir = dirname(fileURLToPath(import.meta.url));
    const buf = readFileSync(join(dir, 'fixtures', 'tabs.docx'));
    const imported = await importDocx(request, buf, 'tabs.docx');
    expect(imported.html).toContain('data-tab-stops="25,50"');
    expect(imported.html).toContain('Tabbed names row here.');
  });

  test('foreign fixture: hard page break maps to br (locked behavior)', async ({ request }) => {
    const { readFileSync } = await import('node:fs');
    const { join, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const dir = dirname(fileURLToPath(import.meta.url));
    const buf = readFileSync(join(dir, 'fixtures', 'pagebreak.docx'));
    const imported = await importDocx(request, buf, 'pagebreak.docx');
    expect(imported.html).toContain('Before the hard break.');
    expect(imported.html).toContain('<br/>');
    expect(imported.html).toContain('After the hard break.');
  });

  test('foreign fixture: headers, first page, page fields', async ({ request }) => {
    const { readFileSync } = await import('node:fs');
    const { join, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const dir = dirname(fileURLToPath(import.meta.url));
    const buf = readFileSync(join(dir, 'fixtures', 'headers.docx'));
    const imported = await importDocx(request, buf, 'headers.docx');
    expect(imported.html).toContain('Body under foreign header.');
    const s = typeof imported.settings === 'string' ? JSON.parse(imported.settings) : imported.settings;
    expect(s.headerFooter.header.default).toBe('Foreign header text');
    expect(s.headerFooter.header.first).toBe('First page header');
    expect(s.headerFooter.footer.default).toBe('Foreign footer text');
    expect(s.headerFooter.differentFirstPage).toBe(true);
    expect(s.headerFooter.pageNumbersEnabled).toBe(true);
    expect(s.headerFooter.pageNumberAlign).toBe('center');
  });

  test('UI import flow creates a document with content and settings', async ({
    page,
    request,
  }) => {
    const seed = await createDoc(request, { title: 'E2E Seed', content: '<p>seed</p>' });
    try {
      await login(page, request);
      await openEditor(page, seed.id);
      // Upload the tabs fixture through the hidden file input.
      const { join, dirname } = await import('node:path');
      const { fileURLToPath } = await import('node:url');
      const dir = dirname(fileURLToPath(import.meta.url));
      await page.setInputFiles('input[type="file"]', join(dir, 'fixtures', 'tabs.docx'));
      await page.waitForFunction((old: string) => !window.location.pathname.endsWith(old), seed.id, {
        timeout: 30000,
      }).catch(() => undefined);
      const newId = page.url().split('/').pop()!;
      expect(newId).not.toBe(seed.id);
      await page.waitForSelector('.ProseMirror', { timeout: 30000 });
      await page.waitForTimeout(3000);
      const doc = await (await request.get(`${API_URL}/documents/${newId}`, { headers: { Authorization: `Bearer ${await getTestToken(request)}` } })).json();
      expect(doc.content).toContain('Tabbed names row here.');
      expect(doc.content).toContain('data-tab-stops="25,50"');
      // Source doc untouched by the import.
      const seedDoc = await (await request.get(`${API_URL}/documents/${seed.id}`, { headers: { Authorization: `Bearer ${await getTestToken(request)}` } })).json();
      expect(seedDoc.content).toBe('<p>seed</p>');
      await request.delete(`${API_URL}/documents/${newId}`, { headers: { Authorization: `Bearer ${await getTestToken(request)}` } }).catch(() => undefined);
    } finally {
      await seed.dispose();
    }
  });

  test('exported file is a valid non-trivial package', async ({ page, request }) => {
    const doc = await createDoc(request, {
      title: 'E2E ExportPages',
      content:
        '<p>Export page check one.</p><p>Export page check two.</p><p>Export page check three.</p>',
    });
    try {
      await login(page, request);
      await openEditor(page, doc.id);
      expect(await sheetCount(page)).toBe(1);
      const buf = await exportDocx(request, doc.id);
      expect(buf.length).toBeGreaterThan(1000);
    } finally {
      await doc.dispose();
    }
  });
});
