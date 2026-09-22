import { expect, type APIRequestContext, type Page } from '@playwright/test';

export const API_URL = process.env.BDOC_API_URL ?? 'http://localhost:8080/api';

export interface SeedDoc {
  title: string;
  content: string;
  settings?: string | null;
}

const SENTENCES = [
  'The quick brown fox jumps over the lazy dog. ',
  'Pack my box with five dozen liquor jugs. ',
  'How vexingly quick daft zebras jump! ',
];

/** N varied-length paragraphs (1-6 sentence repeats, deterministic). */
export function paras(n: number, prefix = 'Paragraph'): string {
  const lens = [1, 3, 2, 5, 1, 4, 2, 2, 6, 1, 3, 3, 2, 4, 1, 5, 2, 3, 1, 4, 2, 6, 3, 1, 2, 5, 1, 3, 4, 2];
  let html = '';
  for (let i = 0; i < n; i++) {
    const len = lens[i % lens.length];
    html += `<p>${prefix} ${i + 1}: ` + SENTENCES[i % 3].repeat(len) + '</p>';
  }
  return html;
}

export function bulletList(n: number): string {
  let items = '';
  for (let i = 1; i <= n; i++) items += `<li><p>Bullet item ${i} with some text content here.</p></li>`;
  return `<ul>${items}</ul>`;
}

export function table(rows: number, cols = 2): string {
  let body = '';
  for (let i = 1; i <= rows; i++) {
    body += '<tr>';
    for (let c = 1; c <= cols; c++) body += `<td>R${i}C${c} data</td>`;
    body += '</tr>';
  }
  return `<table><tbody>${body}</tbody></table>`;
}

const TEST_EMAIL = process.env.E2E_EMAIL ?? 'e2e@bdoc.test';
const TEST_PASSWORD = process.env.E2E_PASSWORD ?? 'E2ETest123!';

let cachedToken: string | null = null;

export async function getTestToken(request: APIRequestContext): Promise<string> {
  if (cachedToken) return cachedToken;
  // Try login first, then register if needed.
  let res = await request.post(`${API_URL}/auth/login`, {
    data: { email: TEST_EMAIL, password: TEST_PASSWORD },
  });
  if (!res.ok()) {
    res = await request.post(`${API_URL}/auth/register`, {
      data: { email: TEST_EMAIL, password: TEST_PASSWORD },
    });
    if (res.ok()) {
      const data = (await res.json()) as { token: string };
      cachedToken = data.token;
      return cachedToken;
    }
    // If register also fails (already exists), try login again.
    res = await request.post(`${API_URL}/auth/login`, {
      data: { email: TEST_EMAIL, password: TEST_PASSWORD },
    });
  }
  expect(res.ok()).toBeTruthy();
  const data = (await res.json()) as { token: string };
  cachedToken = data.token;
  return cachedToken;
}

async function authedHeaders(request: APIRequestContext): Promise<Record<string, string>> {
  const token = await getTestToken(request);
  return { Authorization: `Bearer ${token}` };
}

/** Create a document via the API. Caller owns cleanup via dispose(). */
export async function createDoc(
  request: APIRequestContext,
  seed: SeedDoc,
): Promise<{ id: string; dispose: () => Promise<void> }> {
  const id = crypto.randomUUID();
  const headers = await authedHeaders(request);
  const res = await request.post(API_URL + '/documents', {
    headers,
    data: {
      id,
      title: seed.title,
      content: seed.content,
      settings: seed.settings ?? null,
      updatedAt: new Date().toISOString(),
    },
  });
  expect(res.ok()).toBeTruthy();
  return {
    id,
    dispose: async () => {
      const h = await authedHeaders(request);
      await request.delete(`${API_URL}/documents/${id}`, { headers: h }).catch(() => undefined);
    },
  };
}

/** Real login via JWT and dismiss dialogs. */
export async function login(page: Page, request?: APIRequestContext): Promise<void> {
  if (request) {
    const token = await getTestToken(request);
    await page.goto('/login');
    await page.evaluate(
      ({ t, e }) => {
        localStorage.setItem('bdoc-token', t);
        localStorage.setItem('bdoc-email', e);
      },
      { t: token, e: TEST_EMAIL },
    );
  } else {
    throw new Error('login(page) without request is no longer supported (strict auth requires a real JWT)');
  }
  page.on('dialog', (d) => void d.dismiss().catch(() => undefined));
}

/** Open an editor and wait until content + pagination have settled. */
export async function openEditor(page: Page, id: string): Promise<void> {
  await page.goto(`/editor/${id}`);
  await page.waitForSelector('.ProseMirror', { timeout: 30000 });
  // Initial pagination (120/400ms) + throttle windows + fonts.
  await page.waitForTimeout(3500);
}

export async function sheetCount(page: Page): Promise<number> {
  return page.evaluate(() => document.querySelectorAll('.page-sheet').length);
}

export async function breakCount(page: Page): Promise<number> {
  return page.evaluate(() => document.querySelectorAll('.page-break').length);
}

export async function editorText(page: Page): Promise<string> {
  return page.evaluate(() => document.querySelector('.ProseMirror')?.innerText ?? '');
}

export async function statusBar(page: Page): Promise<string> {
  const t = await page.evaluate(() => document.querySelector('.editor-statusbar')?.innerText ?? '');
  return t.replace(/\n/g, ' | ');
}

/** True when no content block paints inside an inter-page gap band. */
export async function noTextInGaps(page: Page): Promise<{ ok: boolean; bad: string[] }> {
  return page.evaluate(() => {
    const base = document.querySelector('.bdoc-page')!.getBoundingClientRect().top;
    const sheets = Array.from(document.querySelectorAll('.page-sheet')).map((s) => {
      const r = s.getBoundingClientRect();
      return { top: r.top - base, bottom: r.bottom - base };
    });
    const gaps: { top: number; bottom: number }[] = [];
    for (let i = 0; i + 1 < sheets.length; i++) gaps.push({ top: sheets[i].bottom, bottom: sheets[i + 1].top });
    const bad: string[] = [];
    document.querySelector('.ProseMirror')!.childNodes.forEach((el) => {
      if (el.nodeType !== 1 || (el as HTMLElement).classList.contains('page-break')) return;
      const r = (el as HTMLElement).getBoundingClientRect();
      const t = r.top - base;
      const b = r.bottom - base;
      if (gaps.some((g) => t < g.bottom - 2 && b > g.top + 2)) bad.push((el as HTMLElement).tagName);
    });
    return { ok: bad.length === 0, bad };
  });
}

/** Place the caret with a real mouse click at (x, y) viewport coords. */
export async function clickAt(page: Page, x: number, y: number): Promise<void> {
  await page.mouse.click(x, y);
  await page.waitForTimeout(300);
}

/** Center of an element matching selector (scrolls it into view first). */
export async function centerOf(page: Page, selector: string, index = 0): Promise<{ x: number; y: number }> {
  return page.evaluate(
    ([sel, i]) => {
      const els = Array.from(document.querySelectorAll(sel));
      const el = els[i] as HTMLElement;
      el.scrollIntoView({ block: 'center' });
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    },
    [selector, index] as const,
  );
}

/** Current caret block as TAG#index + offset (for click-mapping assertions). */
export async function caretInfo(page: Page): Promise<string> {
  return page.evaluate(() => {
    const s = window.getSelection();
    if (!s?.anchorNode) return 'NONE';
    const pm = document.querySelector('.ProseMirror')!;
    let el: Element | null =
      s.anchorNode.nodeType === 3 ? s.anchorNode.parentElement : (s.anchorNode as Element);
    let b = el;
    while (b && b.parentElement !== pm) b = b.parentElement;
    if (!b) return 'OUTSIDE';
    return `${b.tagName}#${Array.from(pm.children).indexOf(b)} off=${s.anchorOffset}`;
  });
}

/** Open a navbar menu by label and wait for its portal panel. */
export async function openMenu(page: Page, label: string): Promise<void> {
  await page.evaluate((l) => {
    const b = Array.from(document.querySelectorAll('nav > div:last-child button')).find(
      (x) => x.textContent?.trim() === l,
    ) as HTMLButtonElement | undefined;
    b?.click();
  }, label);
  await page.waitForTimeout(400);
}

/** Click a menu/dialog button by exact visible label (portal-safe). */
export async function clickButton(page: Page, label: string, exact = true): Promise<boolean> {
  const ok = await page.evaluate((l: string, ex: boolean) => {
    const btns = Array.from(document.querySelectorAll('button'));
    const b = btns.find((x) => {
      if (x.closest('nav')) return false;
      const t = x.textContent?.trim() ?? '';
      return ex ? t === l : t.startsWith(l);
    }) as HTMLButtonElement | undefined;
    if (!b) return false;
    b.click();
    return true;
  }, [label, exact] as const);
  await page.waitForTimeout(400);
  return ok;
}
