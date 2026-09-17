import axios from 'axios';
import type { Document } from '../../domain/models/DocumentModel';

const API = `${import.meta.env.VITE_API_URL ?? '/api'}/documents`;

export const exportDocumentToDocx = async (doc: Document): Promise<void> => {
  const res = await axios.get<Blob>(`${API}/${doc.id}/export`, { responseType: 'blob' });
  const url = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${doc.title || 'document'}.docx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

export interface DocxImportResult {
  html: string;
  /** PageSettings JSON (page setup + header/footer), if the file carried any. */
  settings: string | null;
}

export const importDocumentFromDocx = async (file: File): Promise<DocxImportResult> => {
  const form = new FormData();
  form.append('file', file);
  const res = await axios.post<{ html: string; settings?: unknown }>(`${API}/import`, form);
  const s = res.data.settings;
  return {
    html: res.data.html ?? '',
    settings: typeof s === 'string' ? s : s ? JSON.stringify(s) : null,
  };
};