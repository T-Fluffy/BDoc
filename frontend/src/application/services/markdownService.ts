import axios from 'axios';

const API = `${import.meta.env.VITE_API_URL ?? '/api'}/documents`;

export const exportDocumentToMarkdown = async (doc: { id: string; title: string }): Promise<void> => {
  const res = await axios.get<Blob>(`${API}/${doc.id}/export/markdown`, { responseType: 'blob' });
  const url = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${doc.title || 'document'}.md`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

export interface MarkdownImportResult {
  html: string;
}

export const importDocumentFromMarkdown = async (file: File): Promise<MarkdownImportResult> => {
  const form = new FormData();
  form.append('file', file);
  const res = await axios.post<{ html: string }>(`${API}/import/markdown`, form);
  return { html: res.data.html ?? '' };
};
