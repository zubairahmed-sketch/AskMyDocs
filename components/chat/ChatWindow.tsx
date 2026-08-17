'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MessageBubble, type Message } from './MessageBubble';
import { SourcesPanel } from './SourcesPanel';
import { ScopeSelector } from './ScopeSelector';
import { cn } from '@/lib/utils';

interface ChatWindowProps {
  conversationId: string | null;
  onConversationCreated: (id: string) => void;
}

export function ChatWindow({ conversationId, onConversationCreated }: ChatWindowProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedSources, setSelectedSources] = useState<Message['retrieved_chunks']>(null);
  const [scopeIds, setScopeIds] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load existing messages when conversationId changes
  useEffect(() => {
    if (!conversationId) {
      setMessages([]);
      return;
    }
    (async () => {
      const res = await fetch(`/api/conversations/${conversationId}`);
      if (res.ok) {
        const data = await res.json();
        setMessages(
          (data.messages ?? []).map((m: Record<string, unknown>) => ({
            id: m.id as string,
            role: m.role as 'user' | 'assistant',
            content: m.content as string,
            citations: m.citations ? JSON.parse(m.citations as string) : null,
            retrieved_chunks: m.retrieved_chunks ? JSON.parse(m.retrieved_chunks as string) : null,
          }))
        );
      }
    })();
  }, [conversationId]);

  // Auto-scroll on new messages
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    const question = input.trim();
    if (!question || loading) return;

    setInput('');
    setLoading(true);

    let activeConvId = conversationId;

    // Create conversation if needed
    if (!activeConvId) {
      const res = await fetch('/api/conversations', { method: 'POST' });
      if (!res.ok) {
        setLoading(false);
        return;
      }
      const data = await res.json();
      activeConvId = data.conversation.id;
      onConversationCreated(activeConvId!);
    }

    // Add user message to UI immediately
    const userMsg: Message = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: question,
      citations: null,
      retrieved_chunks: null,
    };
    setMessages((prev) => [...prev, userMsg]);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: activeConvId,
          question,
          scope_document_ids: scopeIds.length > 0 ? scopeIds : undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Request failed' }));
        const errorMsg: Message = {
          id: `err-${Date.now()}`,
          role: 'assistant',
          content: err.error ?? 'Something went wrong. Please try again.',
          citations: null,
          retrieved_chunks: null,
        };
        setMessages((prev) => [...prev, errorMsg]);
        return;
      }

      const data = await res.json();
      const assistantMsg: Message = {
        id: data.message.id,
        role: 'assistant',
        content: data.message.content,
        citations: data.message.citations,
        retrieved_chunks: data.message.retrieved_chunks,
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch {
      const errorMsg: Message = {
        id: `err-${Date.now()}`,
        role: 'assistant',
        content: 'Network error. Check your connection and try again.',
        citations: null,
        retrieved_chunks: null,
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, conversationId, onConversationCreated, scopeIds]);

  return (
    <div className="flex h-full">
      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Scope selector */}
        <div className="border-b border-border px-4 py-2">
          <ScopeSelector selectedIds={scopeIds} onChange={setScopeIds} />
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-auto px-4 py-6 space-y-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center gap-3">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                <svg className="w-6 h-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium">Ask a question about your documents</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Answers are grounded in your uploads — every claim traceable to a chunk and page.
                </p>
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              onShowSources={
                msg.retrieved_chunks ? () => setSelectedSources(msg.retrieved_chunks) : undefined
              }
            />
          ))}

          {loading && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-muted max-w-md">
              <div className="flex gap-1">
                <span className="w-2 h-2 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
              <span className="text-xs text-muted-foreground">Searching documents…</span>
            </div>
          )}
        </div>

        {/* Input bar */}
        <form onSubmit={handleSubmit} className="border-t border-border p-4">
          <div className="flex gap-2 max-w-3xl mx-auto">
            <Input
              id="chat-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask a question about your documents…"
              disabled={loading}
              className="flex-1"
              autoComplete="off"
            />
            <Button type="submit" disabled={loading || !input.trim()}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
              </svg>
            </Button>
          </div>
        </form>
      </div>

      {/* Sources panel (right sidebar) */}
      {selectedSources && (
        <SourcesPanel
          chunks={selectedSources}
          onClose={() => setSelectedSources(null)}
        />
      )}
    </div>
  );
}
