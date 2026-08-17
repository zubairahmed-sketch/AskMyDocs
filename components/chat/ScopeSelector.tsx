'use client';

import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface Document {
  id: string;
  filename: string;
  status: string;
}

interface ScopeSelectorProps {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

export function ScopeSelector({ selectedIds, onChange }: ScopeSelectorProps) {
  const [documents, setDocuments] = useState<Document[]>([]);

  useEffect(() => {
    (async () => {
      const res = await fetch('/api/documents');
      if (res.ok) {
        const data = await res.json();
        setDocuments(
          (data.documents ?? []).filter((d: Document) => d.status === 'ready')
        );
      }
    })();
  }, []);

  function toggleDoc(id: string) {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((x) => x !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  }

  if (documents.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No documents ready. Upload and process some first.
      </p>
    );
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="text-xs text-muted-foreground shrink-0 mr-1">Scope:</span>
      <button
        onClick={() => onChange([])}
        className={cn(
          'text-xs px-2 py-0.5 rounded-md transition-colors',
          selectedIds.length === 0
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted text-muted-foreground hover:bg-muted/80'
        )}
      >
        All
      </button>
      {documents.map((doc) => {
        const active = selectedIds.includes(doc.id);
        return (
          <button
            key={doc.id}
            onClick={() => toggleDoc(doc.id)}
            className={cn(
              'text-xs px-2 py-0.5 rounded-md truncate max-w-[140px] transition-colors',
              active
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            )}
            title={doc.filename}
          >
            {doc.filename}
          </button>
        );
      })}
    </div>
  );
}
