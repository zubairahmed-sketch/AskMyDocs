import { AppShell } from '@/components/layout/AppShell';

export const dynamic = 'force-dynamic';

export default function HistoryPage() {
  return (
    <AppShell>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-6">
          <h1 className="text-xl font-semibold tracking-tight">History</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Past Q&amp;A conversations with your documents.
          </p>
        </div>
        <div className="rounded-xl border border-dashed border-border px-4 py-16 text-center">
          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
            <svg className="w-5 h-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
            </svg>
          </div>
          <p className="text-sm font-medium text-foreground">History — Phase 6</p>
          <p className="text-xs text-muted-foreground mt-1">
            Coming in Phase 6: saved conversations, revisitable with original citations.
          </p>
        </div>
      </div>
    </AppShell>
  );
}
