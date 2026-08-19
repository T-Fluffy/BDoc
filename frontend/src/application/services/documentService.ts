import axios from 'axios';
import type { Document } from '../../domain/models/DocumentModel';

const API = `${import.meta.env.VITE_API_URL ?? '/api'}/documents`;

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