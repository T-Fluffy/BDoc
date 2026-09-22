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
    const status = error?.response?.status;
    if (status === 401) {
      // Token is dead: drop the session and bounce to login.
      localStorage.removeItem('bdoc-token');
      localStorage.removeItem('bdoc-email');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    // NOTE: 403 (valid session, forbidden resource) intentionally does NOT
    // clear the session — e.g. opening a revoked shared link must show an
    // access error, not log the user out. Callers surface it in UI.
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

export const getAccessLevel = async (docId: string): Promise<string> => {
  const res = await axios.get<{ level: string }>(`${API}/${docId}/access`);
  return res.data.level;
};

export interface ShareInfo {
  userId: string;
  email: string;
  permission: string;
}

export const getShares = async (docId: string): Promise<ShareInfo[]> => {
  const res = await axios.get<ShareInfo[]>(`${API}/${docId}/shares`);
  return res.data;
};

export const addShare = async (docId: string, email: string, permission: string): Promise<ShareInfo> => {
  const res = await axios.post<ShareInfo>(`${API}/${docId}/shares`, { email, permission });
  return res.data;
};

export const revokeShare = async (docId: string, userId: string): Promise<void> => {
  await axios.delete(`${API}/${docId}/shares/${userId}`);
};