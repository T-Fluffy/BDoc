import { test, expect } from '@playwright/test';
import { API_URL, createDoc } from './helpers';

test.describe('documents API contract', () => {
  test('list returns an array', async ({ request }) => {
    const res = await request.get(`${API_URL}/documents`);
    expect(res.ok()).toBeTruthy();
    expect(Array.isArray(await res.json())).toBe(true);
  });

  test('get unknown id returns 404', async ({ request }) => {
    const res = await request.get(`${API_URL}/documents/00000000-0000-0000-0000-000000000000`);
    expect(res.status()).toBe(404);
  });

  test('create returns 201 with the document', async ({ request }) => {
    const id = crypto.randomUUID();
    const res = await request.post(`${API_URL}/documents`, {
      data: { id, title: 'E2E API', content: '<p>hi</p>', updatedAt: new Date().toISOString() },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.id).toBe(id);
    await request.delete(`${API_URL}/documents/${id}`);
  });

  test('update rejects id mismatch with 400, persists otherwise', async ({ request }) => {
    const doc = await createDoc(request, { title: 'E2E APIU', content: '<p>a</p>' });
    try {
      const bad = await request.put(`${API_URL}/documents/${doc.id}`, {
        data: { ...(await (await request.get(`${API_URL}/documents/${doc.id}`)).json()), id: crypto.randomUUID() },
      });
      expect(bad.status()).toBe(400);
      const cur = await (await request.get(`${API_URL}/documents/${doc.id}`)).json();
      const ok = await request.put(`${API_URL}/documents/${doc.id}`, {
        data: { ...cur, title: 'E2E APIU2' },
      });
      expect(ok.status()).toBe(204);
      const after = await (await request.get(`${API_URL}/documents/${doc.id}`)).json();
      expect(after.title).toBe('E2E APIU2');
    } finally {
      await doc.dispose();
    }
  });

  test('delete is idempotent and removes the document', async ({ request }) => {
    const doc = await createDoc(request, { title: 'E2E APID', content: '<p>x</p>' });
    const del = await request.delete(`${API_URL}/documents/${doc.id}`);
    expect(del.status()).toBe(204);
    expect((await request.get(`${API_URL}/documents/${doc.id}`)).status()).toBe(404);
    expect((await request.delete(`${API_URL}/documents/${doc.id}`)).status()).toBe(204);
  });

  test('export serves a docx download', async ({ request }) => {
    const doc = await createDoc(request, { title: 'E2E APIX', content: '<p>export me</p>' });
    try {
      const res = await request.get(`${API_URL}/documents/${doc.id}/export`);
      expect(res.ok()).toBeTruthy();
      expect(res.headers()['content-type']).toContain(
        'officedocument.wordprocessingml.document',
      );
      const disp = res.headers()['content-disposition'] ?? '';
      expect(disp).toContain('.docx');
      expect((await res.body()).length).toBeGreaterThan(1000);
    } finally {
      await doc.dispose();
    }
  });

  test('import rejects empty uploads with 400', async ({ request }) => {
    const res = await request.post(`${API_URL}/documents/import`, {
      multipart: { file: { name: 'empty.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: Buffer.alloc(0) } },
    });
    expect(res.status()).toBe(400);
  });
});
