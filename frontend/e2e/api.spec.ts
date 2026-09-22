import { test, expect } from '@playwright/test';
import { API_URL, createDoc, getTestToken } from './helpers';

test.describe('documents API contract', () => {
  test('anonymous requests are rejected with 401', async ({ request }) => {
    const list = await request.get(`${API_URL}/documents`);
    expect(list.status()).toBe(401);
    const get = await request.get(`${API_URL}/documents/00000000-0000-0000-0000-000000000000`);
    expect(get.status()).toBe(401);
    const create = await request.post(`${API_URL}/documents`, {
      data: { id: crypto.randomUUID(), title: 'anon', content: '', updatedAt: new Date().toISOString() },
    });
    expect(create.status()).toBe(401);
    const imp = await request.post(`${API_URL}/documents/import`, {
      multipart: { file: { name: 'empty.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: Buffer.alloc(0) } },
    });
    expect(imp.status()).toBe(401);
  });

  test('list returns an array', async ({ request }) => {
    const headers = { Authorization: `Bearer ${await getTestToken(request)}` };
    const res = await request.get(`${API_URL}/documents`, { headers });
    expect(res.ok()).toBeTruthy();
    expect(Array.isArray(await res.json())).toBe(true);
  });

  test('get unknown id returns 404', async ({ request }) => {
    const headers = { Authorization: `Bearer ${await getTestToken(request)}` };
    const res = await request.get(`${API_URL}/documents/00000000-0000-0000-0000-000000000000`, { headers });
    expect(res.status()).toBe(404);
  });

  test('create returns 201 with the document', async ({ request }) => {
    const headers = { Authorization: `Bearer ${await getTestToken(request)}` };
    const id = crypto.randomUUID();
    const res = await request.post(`${API_URL}/documents`, {
      headers,
      data: { id, title: 'E2E API', content: '<p>hi</p>', updatedAt: new Date().toISOString() },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.id).toBe(id);
    await request.delete(`${API_URL}/documents/${id}`, { headers });
  });

  test('update rejects id mismatch with 400, persists otherwise', async ({ request }) => {
    const headers = { Authorization: `Bearer ${await getTestToken(request)}` };
    const doc = await createDoc(request, { title: 'E2E APIU', content: '<p>a</p>' });
    try {
      const bad = await request.put(`${API_URL}/documents/${doc.id}`, {
        headers,
        data: { ...(await (await request.get(`${API_URL}/documents/${doc.id}`, { headers })).json()), id: crypto.randomUUID() },
      });
      expect(bad.status()).toBe(400);
      const cur = await (await request.get(`${API_URL}/documents/${doc.id}`, { headers })).json();
      const ok = await request.put(`${API_URL}/documents/${doc.id}`, {
        headers,
        data: { ...cur, title: 'E2E APIU2' },
      });
      expect(ok.status()).toBe(204);
      const after = await (await request.get(`${API_URL}/documents/${doc.id}`, { headers })).json();
      expect(after.title).toBe('E2E APIU2');
    } finally {
      await doc.dispose();
    }
  });

  test('delete is idempotent and removes the document', async ({ request }) => {
    const headers = { Authorization: `Bearer ${await getTestToken(request)}` };
    const doc = await createDoc(request, { title: 'E2E APID', content: '<p>x</p>' });
    const del = await request.delete(`${API_URL}/documents/${doc.id}`, { headers });
    expect(del.status()).toBe(204);
    expect((await request.get(`${API_URL}/documents/${doc.id}`, { headers })).status()).toBe(404);
    expect((await request.delete(`${API_URL}/documents/${doc.id}`, { headers })).status()).toBe(204);
  });

  test('export serves a docx download', async ({ request }) => {
    const headers = { Authorization: `Bearer ${await getTestToken(request)}` };
    const doc = await createDoc(request, { title: 'E2E APIX', content: '<p>export me</p>' });
    try {
      const res = await request.get(`${API_URL}/documents/${doc.id}/export`, { headers });
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
    const headers = { Authorization: `Bearer ${await getTestToken(request)}` };
    const res = await request.post(`${API_URL}/documents/import`, {
      headers,
      multipart: { file: { name: 'empty.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: Buffer.alloc(0) } },
    });
    expect(res.status()).toBe(400);
  });

  test('per-user isolation: user B cannot see user A docs', async ({ request }) => {
    const headersA = { Authorization: `Bearer ${await getTestToken(request)}` };
    const docA = await createDoc(request, { title: 'E2E Private A', content: '<p>secret</p>' });
    try {
      // Create second user via direct API (bypass helper cache)
      const emailB = `e2e-b-${Date.now()}@bdoc.test`;
      const pwB = 'E2ETest123!';
      await request.post(`${API_URL}/auth/register`, { data: { email: emailB, password: pwB } });
      const loginB = await request.post(`${API_URL}/auth/login`, { data: { email: emailB, password: pwB } });
      const tokenB = (await loginB.json() as { token: string }).token;
      const headersB = { Authorization: `Bearer ${tokenB}` };
      // B cannot GET A's doc
      const getAasB = await request.get(`${API_URL}/documents/${docA.id}`, { headers: headersB });
      expect([403, 404]).toContain(getAasB.status());
      // B's list does not contain A's doc
      const listB = await (await request.get(`${API_URL}/documents`, { headers: headersB })).json() as { id: string }[];
      expect(listB.some((d) => d.id === docA.id)).toBe(false);
      // A can still see it
      const getAasA = await request.get(`${API_URL}/documents/${docA.id}`, { headers: headersA });
      expect(getAasA.ok()).toBeTruthy();
      // Cleanup B's user docs are isolated, but we only need to clean A
    } finally {
      await docA.dispose();
    }
  });
});
