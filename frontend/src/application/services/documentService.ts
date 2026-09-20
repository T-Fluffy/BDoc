import axios from 'axios';
import type { Document } from '../../domain/models/DocumentModel';

const API = `${import.meta.env.VITE_API_URL ?? '/api'}/documents`;

// Attach JWT if present.
axios.interceptors.request.use((config) => {
  const token = localStorage.getItem('bdoc-token');
  if (token) {
    config.headers = config.headers ?? {};
    (config.headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
  }
  return config;
});

axios.interceptors.response.use(
  (r) => r,
  (error) => {
    if (error?.response?.status === 401) {
      localStorage.removeItem('bdoc-token');
      localStorage.removeItem('bdoc-email');
      // Let the UI's auth guard redirect to /login on next render.
    }
    return Promise.reject(error);
  },
);

export const getDocuments = async (): Promise<Document[]> => {
  const res = await axios.get<Document[]>(API);
  return res.data;
};

export const getDocument = async (id: string): Promise<Document> => {
  const res = await axios.get<Document>(`${API}/${id}`);
  return res.data;
};

export const createDocument = async (title: string): Promise<Document> => {
  const res = await axios.post<Document>(API, {
    id: crypto.randomUUID(),
    title,
    content: '',
    updatedAt: new Date().toISOString(),
  });
  return res.data;
};

export const updateDocument = async (doc: Document): Promise<void> => {
  await axios.put(`${API}/${doc.id}`, doc);
};

export const deleteDocument = async (id: string): Promise<void> => {
  await axios.delete(`${API}/${id}`);
};

export interface DocumentVersion {
  id: string;
  documentId: string;
  title: string;
  content: string;
  settings: string | null;
  createdAt: string;
}

export const getVersions = async (docId: string): Promise<DocumentVersion[]> => {
  const res = await axios.get<DocumentVersion[]>(`${API}/${docId}/versions`);
  return res.data;
};

export const restoreVersion = async (docId: string, versionId: string): Promise<void> => {
  await axios.post(`${API}/${docId}/restore/${versionId}`);
};