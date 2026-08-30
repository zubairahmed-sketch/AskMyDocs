'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from './StatusBadge';
import { cn } from '@/lib/utils';

export interface Document {
  id: string;
  filename: string;
  file_type: string;
  status: 'processing' | 'ready' | 'failed';
  page_count: number | null;
  error_message: string | null;
  created_at: string;
}

interface DocumentCardProps {
  document: Document;
  onDelete: (id: string) => Promise<void>;
}

const FILE_ICONS: Record<string, React.ReactNode> = {
  pdf: (
    <svg className="w-5 h-5 text-red-500" fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
    </svg>
  ),
  txt: (
    <svg className="w-5 h-5 text-slate-500" fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm3 1h6v4H7V5zm8 8v2h1v1H4v-1h1v-2h-.5a.5.5 0 010-1H5v-2h10v2h.5a.5.5 0 010 1H15z" clipRule="evenodd" />
    </svg>
  ),
  md: (
    <svg className="w-5 h-5 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm3 1h6v4H7V5zm8 8v2h1v1H4v-1h1v-2h-.5a.5.5 0 010-1H5v-2h10v2h.5a.5.5 0 010 1H15z" clipRule="evenodd" />
    </svg>
  ),
};

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function DocumentCard({ document, onDelete }: DocumentCardProps) {
  const [deleting, setDeleting] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      await onDelete(document.id);
    } finally {
      setDeleting(false);
      setConfirming(false);
    }
  }

  return (
    <Card className={cn(
      'group transition-all duration-200 hover:shadow-md',
      document.status === 'failed' && 'border-destructive/30'
    )}>
      <CardContent className="p-4">
        {/* Inline delete confirmation */}
        {confirming ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-destructive shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
              </svg>
              <p className="text-sm font-medium">Delete this document?</p>
            </div>
            <p className="text-xs text-muted-foreground truncate" title={document.filename}>
              &ldquo;{document.filename}&rdquo; will be permanently removed.
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="destructive"
                onClick={handleDelete}
                disabled={deleting}
                className="text-xs h-7 px-3"
              >
                {deleting ? (
                  <span className="flex items-center gap-1.5">
                    <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Deleting…
                  </span>
                ) : 'Delete'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setConfirming(false)}
                disabled={deleting}
                className="text-xs h-7 px-3"
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <>
            {/* Header: icon + filename */}
            <div className="flex items-start gap-3">
              <div className="mt-0.5 shrink-0">
                {FILE_ICONS[document.file_type] ?? FILE_ICONS.txt}
              </div>
              <div className="flex-1 min-w-0">
                <p
                  className="text-sm font-medium truncate text-foreground"
                  title={document.filename}
                >
                  {document.filename}
                </p>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <StatusBadge status={document.status} />
                  {document.page_count != null && (
                    <span className="font-data text-xs text-muted-foreground">
                      {document.page_count} {document.page_count === 1 ? 'page' : 'pages'}
                    </span>
                  )}
                </div>
              </div>

              {/* Delete button — triggers inline confirmation */}
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0 h-7 w-7 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity hover:text-destructive hover:bg-destructive/10"
                onClick={() => setConfirming(true)}
                aria-label={`Delete ${document.filename}`}
              >
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </Button>
            </div>

            {/* Error message */}
            {document.status === 'failed' && document.error_message && (
              <p className="mt-2 text-xs text-destructive bg-destructive/5 rounded px-2 py-1 line-clamp-2">
                {document.error_message}
              </p>
            )}

            {/* Upload date */}
            <p className="mt-2 text-xs text-muted-foreground">
              Uploaded {formatDate(document.created_at)}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
