'use client';

import { cn } from '@/lib/utils';
import type { RetrievedChunkInfo } from './MessageBubble';

interface SourcesPanelProps {
  chunks: RetrievedChunkInfo[];
  onClose: () => void;
}

export function SourcesPanel({ chunks, onClose }: SourcesPanelProps) {
  // Sort: cited chunks first, then by similarity descending
  const sorted = [...chunks].sort((a, b) => {
    if (a.cited !== b.cited) return a.cited ? -1 : 1;
    return b.similarity - a.similarity;
  });

  return (
    <div className="w-80 border-l border-border bg-background flex flex-col shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h3 className="text-sm font-semibold">Sources</h3>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Close sources panel"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Chunk list */}
      <div className="flex-1 overflow-auto p-3 space-y-2">
        {sorted.map((chunk, idx) => (
          <div
            key={chunk.chunk_id}
            className={cn(
              'rounded-lg border p-3 text-xs transition-colors',
              chunk.cited
                ? 'border-primary/30 bg-primary/5'
                : 'border-border bg-muted/30'
            )}
          >
            {/* Header: filename + page */}
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className="font-medium truncate text-foreground" title={chunk.filename}>
                {chunk.filename}
              </span>
              {chunk.cited && (
                <span className="text-[10px] font-semibold text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                  CITED
                </span>
              )}
            </div>

            {/* Metadata row */}
            <div className="flex items-center gap-2 mb-2 font-data text-muted-foreground">
              {chunk.page_number && (
                <span>p.{chunk.page_number}</span>
              )}
              <span>{(chunk.similarity * 100).toFixed(1)}% match</span>
            </div>

            {/* Excerpt */}
            <p className="text-muted-foreground leading-relaxed line-clamp-4">
              {chunk.excerpt}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
