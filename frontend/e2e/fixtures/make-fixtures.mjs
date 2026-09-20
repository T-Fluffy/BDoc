/**
 * Generates binary .docx fixtures for import tests (run manually, commit outputs):
 *
 *   node e2e/fixtures/make-fixtures.mjs   (backend must be running)
 *
 * Each fixture starts from a real backend export (guaranteed-valid package)
 * and applies a minimal, surgical modification:
 *   tabs.docx      — w:tabs on the first paragraph (import must read stops)
 *   pagebreak.docx — a real w:br w:type="page" run (import maps to <br/>)
 *   headers.docx   — header/footer parts + titlePg + first-page header
 */
import AdmZip from 'adm-zip';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const API = process.env.BDOC_API_URL ?? 'http://localhost:8080/api';
const dir = path.dirname(fileURLToPath(import.meta.url));

async function exportDoc(title, content) {
  const id = crypto.randomUUID();
  // NOTE: non-null settings so the export includes a sectPr to patch.
  const settings = JSON.stringify({ size: 'A4', orientation: 'portrait', margins: 'normal' });
  await fetch(`${API}/documents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, title, content, settings, updatedAt: new Date().toISOString() }),
  });
  const res = await fetch(`${API}/documents/${id}/export`);
  if (!res.ok) throw new Error(`export failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await fetch(`${API}/documents/${id}`, { method: 'DELETE' });
  return buf;
}

function readXml(zip, name) {
  return zip.readAsText(zip.getEntry(name));
}

function writeXml(zip, name, text) {
  zip.updateFile(name, Buffer.from(text, 'utf8'));
}

async function tabs() {
  const zip = new AdmZip(
    await exportDoc('tabs-src', '<p>Tabbed names row here.</p><p>Plain row.</p>'),
  );
  let doc = readXml(zip, 'word/document.xml');
  doc = doc.replace(
    '<w:pPr>',
    '<w:pPr><w:tabs><w:tab w:val="left" w:pos="1417"/><w:tab w:val="left" w:pos="2835"/></w:tabs>',
  );
  writeXml(zip, 'word/document.xml', doc);
  fs.writeFileSync(path.join(dir, 'tabs.docx'), zip.toBuffer());
}

async function pagebreak() {
  const zip = new AdmZip(
    await exportDoc('pb-src', '<p>Before the hard break.</p><p>After the hard break.</p>'),
  );
  let doc = readXml(zip, 'word/document.xml');
  doc = doc.replace(
    /<\/w:p>/,
    '</w:p><w:p><w:r><w:br w:type="page"/></w:r></w:p>',
  );
  writeXml(zip, 'word/document.xml', doc);
  fs.writeFileSync(path.join(dir, 'pagebreak.docx'), zip.toBuffer());
}

async function headers() {
  const zip = new AdmZip(await exportDoc('hdr-src', '<p>Body under foreign header.</p>'));
  const wNs = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const rNs = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const hdr =
    `<w:hdr xmlns:w="${wNs}" xmlns:r="${rNs}"><w:p><w:r><w:t>Foreign header text</w:t></w:r></w:p></w:hdr>`;
  const ftr =
    `<w:ftr xmlns:w="${wNs}" xmlns:r="${rNs}"><w:p><w:r><w:t>Foreign footer text</w:t></w:r></w:p>` +
    `<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:fldSimple w:instr=" PAGE "><w:r><w:t>7</w:t></w:r></w:fldSimple></w:p></w:ftr>`;
  const firstHdr =
    `<w:hdr xmlns:w="${wNs}" xmlns:r="${rNs}"><w:p><w:r><w:t>First page header</w:t></w:r></w:p></w:hdr>`;
  zip.addFile('word/header1.xml', Buffer.from(hdr));
  zip.addFile('word/footer1.xml', Buffer.from(ftr));
  zip.addFile('word/headerFirst.xml', Buffer.from(firstHdr));

  let ct = readXml(zip, '[Content_Types].xml');
  ct = ct.replace(
    '</Types>',
    '<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>' +
      '<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>' +
      '<Override PartName="/word/headerFirst.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/></Types>',
  );
  writeXml(zip, '[Content_Types].xml', ct);

  let rels = readXml(zip, 'word/_rels/document.xml.rels');
  rels = rels.replace(
    '</Relationships>',
    '<Relationship Id="rId9901" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>' +
      '<Relationship Id="rId9902" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>' +
      '<Relationship Id="rId9903" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="headerFirst.xml"/></Relationships>',
  );
  writeXml(zip, 'word/_rels/document.xml.rels', rels);

  let doc = readXml(zip, 'word/document.xml');
  // The plain export declares only xmlns:w — r:id references need xmlns:r.
  doc = doc.replace(
    '<w:document xmlns:w=',
    `<w:document xmlns:r="${rNs}" xmlns:w=`,
  );
  doc = doc.replace(
    '</w:sectPr>',
    '<w:titlePg/><w:headerReference w:type="default" r:id="rId9901"/><w:headerReference w:type="first" r:id="rId9903"/><w:footerReference w:type="default" r:id="rId9902"/></w:sectPr>',
  );
  writeXml(zip, 'word/document.xml', doc);
  fs.writeFileSync(path.join(dir, 'headers.docx'), zip.toBuffer());
}

await tabs();
await pagebreak();
await headers();
console.log('fixtures written to', dir);
