import { useCallback, useEffect, useState } from 'react';
import type { Document } from '../../domain/models/DocumentModel';
import {
  createDocument,
  deleteDocument,
  getDocuments,
} from '../services/documentService';

export function useDocuments() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const docs = await getDocuments();
      setDocuments(docs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load documents');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const create = useCallback(async (title: string) => {
    const doc = await createDocument(title);
    await refresh();
    return doc;
  }, [refresh]);

  const remove = useCallback(async (id: string) => {
    await deleteDocument(id);
    await refresh();
  }, [refresh]);

  return { documents, loading, error, refresh, create, remove };
}