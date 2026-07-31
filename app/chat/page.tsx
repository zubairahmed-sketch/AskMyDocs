import { AppShell } from '@/components/layout/AppShell';

export const dynamic = 'force-dynamic';

export default function ChatPage() {
  return (
    <AppShell>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-6">
          <h1 className="text-xl font-semibold tracking-tight">Chat</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Ask questions about your uploaded documents.
          </p>
        </div>
        <div className="rounded-xl border border-dashed border-border px-4 py-16 text-center">
          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
            <svg className="w-5 h-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
            </svg>
          </div>
          <p className="text-sm font-medium text-foreground">Chat — Phase 5</p>
          <p className="text-xs text-muted-foreground mt-1">
            Coming in Phase 5: RAG-powered Q&amp;A with inline citations and Sources panel.
          </p>
        </div>
      </div>
    </AppShell>
  );
}
