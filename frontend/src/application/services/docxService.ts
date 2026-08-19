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

export const importDocumentFromDocx = async (file: File): Promise<string> => {
  const form = new FormData();
  form.append('file', file);
  const res = await axios.post<{ html: string }>(`${API}/import`, form);
  return res.data.html;
};