'use client';

import { useCallback, useEffect, useState } from 'react';
import { DocumentCard, type Document } from './DocumentCard';

interface DocumentListProps {
  refreshTrigger: number;
}

const POLL_INTERVAL_MS = 5000; // poll every 5s while any doc is processing

export function DocumentList({ refreshTrigger }: DocumentListProps) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDocuments = useCallback(async () => {
    try {
      const res = await fetch('/api/documents');
      if (!res.ok) throw new Error('Failed to load documents');
      const data = await res.json();
      setDocuments(data.documents ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load documents');
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch on mount and whenever refreshTrigger changes
  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments, refreshTrigger]);

  // Poll while any document is still processing
  useEffect(() => {
    const hasProcessing = documents.some((d) => d.status === 'processing');
    if (!hasProcessing) return;

    const interval = setInterval(fetchDocuments, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [documents, fetchDocuments]);

  async function handleDelete(id: string) {
    const res = await fetch(`/api/documents/${id}`, { method: 'DELETE' });
    if (res.ok) {
      setDocuments((prev) => prev.filter((d) => d.id !== id));
    }
  }

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[...Array(3)].map((_, i) => (
          <div
            key={i}
            className="h-[120px] rounded-xl bg-muted animate-pulse"
            style={{ animationDelay: `${i * 0.1}s` }}
          />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-6 text-center">
        <p className="text-sm text-destructive">{error}</p>
        <button
          onClick={fetchDocuments}
          className="mt-2 text-xs text-muted-foreground underline hover:text-foreground"
        >
          Try again
        </button>
      </div>
    );
  }

  if (documents.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border px-4 py-12 text-center">
        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
          <svg className="w-5 h-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
          </svg>
        </div>
        <p className="text-sm font-medium text-foreground">No documents yet</p>
        <p className="text-xs text-muted-foreground mt-1">
          Upload a PDF, TXT, or Markdown file to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {documents.map((doc) => (
        <DocumentCard key={doc.id} document={doc} onDelete={handleDelete} />
      ))}
    </div>
  );
}
