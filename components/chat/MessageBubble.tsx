'use client';

import { cn } from '@/lib/utils';

export interface RetrievedChunkInfo {
  chunk_id: string;
  document_id: string;
  filename: string;
  page_number: number | null;
  similarity: number;
  excerpt: string;
  cited: boolean;
}

export interface CitationInfo {
  marker: number;
  chunkId: string;
  documentId: string;
  filename: string;
  pageNumber: number | null;
  similarity: number;
  excerpt: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations: CitationInfo[] | null;
  retrieved_chunks: RetrievedChunkInfo[] | null;
}

interface MessageBubbleProps {
  message: Message;
  onShowSources?: () => void;
}

/**
 * Render citations as superscript markers linking to sources panel.
 * Citation markers [n] in the text are replaced with styled <sup> elements.
 */
function renderContent(content: string, citations: CitationInfo[] | null) {
  if (!citations || citations.length === 0) {
    return <p className="whitespace-pre-wrap leading-relaxed">{content}</p>;
  }

  // Split content around [n] markers
  const parts = content.split(/(\[\d+\])/g);

  return (
    <p className="whitespace-pre-wrap leading-relaxed">
      {parts.map((part, i) => {
        const match = part.match(/^\[(\d+)\]$/);
        if (match) {
          const num = parseInt(match[1], 10);
          const citation = citations.find((c) => c.marker === num);
          if (citation) {
            return (
              <sup
                key={i}
                className="font-data inline-flex items-center justify-center min-w-[1.1rem] h-4 px-0.5 mx-0.5 rounded text-[10px] font-semibold bg-primary/10 text-primary cursor-help"
                title={`${citation.filename}${citation.pageNumber ? `, p.${citation.pageNumber}` : ''} — ${(citation.similarity * 100).toFixed(0)}% match`}
              >
                {num}
              </sup>
            );
          }
        }
        return <span key={i}>{part}</span>;
      })}
    </p>
  );
}

export function MessageBubble({ message, onShowSources }: MessageBubbleProps) {
  const isUser = message.role === 'user';

  return (
    <div className={cn('flex gap-3 max-w-3xl mx-auto', isUser && 'flex-row-reverse')}>
      {/* Avatar */}
      <div
        className={cn(
          'w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-xs font-semibold',
          isUser ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
        )}
      >
        {isUser ? 'U' : 'A'}
      </div>

      {/* Message body */}
      <div className={cn('flex flex-col gap-1.5 min-w-0', isUser ? 'items-end' : 'items-start')}>
        <div
          className={cn(
            'rounded-xl px-4 py-2.5 text-sm max-w-prose',
            isUser
              ? 'bg-primary text-primary-foreground rounded-tr-sm'
              : 'bg-muted text-foreground rounded-tl-sm'
          )}
        >
          {renderContent(message.content, message.citations)}
        </div>

        {/* Show sources button for assistant messages with retrieved chunks */}
        {!isUser && message.retrieved_chunks && message.retrieved_chunks.length > 0 && (
          <button
            onClick={onShowSources}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m9.86-4.354a4.5 4.5 0 0 0-1.242-7.244l4.5-4.5a4.5 4.5 0 0 1 6.364 6.364l-1.757 1.757" />
            </svg>
            {message.retrieved_chunks.filter((c) => c.cited).length} sources
          </button>
        )}
      </div>
    </div>
  );
}
