'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface UsageData {
  total_tokens: number;
  by_type: {
    embedding_document: number;
    embedding_query: number;
    generation: number;
  };
}

const TYPE_LABELS: Record<string, string> = {
  embedding_document: 'Document Embeddings',
  embedding_query: 'Query Embeddings',
  generation: 'Answer Generation',
};

const TYPE_COLORS: Record<string, string> = {
  embedding_document: 'bg-blue-500',
  embedding_query: 'bg-emerald-500',
  generation: 'bg-violet-500',
};

export default function SettingsPage() {
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [loadingUsage, setLoadingUsage] = useState(true);
  const [exporting, setExporting] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    (async () => {
      const res = await fetch('/api/usage');
      if (res.ok) {
        setUsage(await res.json());
      }
      setLoadingUsage(false);
    })();
  }, []);

  async function handleExport() {
    setExporting(true);
    try {
      // Fetch all user data
      const [docsRes, convsRes, usageRes] = await Promise.all([
        fetch('/api/documents'),
        fetch('/api/conversations'),
        fetch('/api/usage'),
      ]);

      const docs = docsRes.ok ? await docsRes.json() : {};
      const convs = convsRes.ok ? await convsRes.json() : {};
      const usageData = usageRes.ok ? await usageRes.json() : {};

      const exportData = {
        exported_at: new Date().toISOString(),
        documents: docs.documents ?? [],
        conversations: convs.conversations ?? [],
        usage: usageData,
      };

      // Download as JSON
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `askmydocs-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  const maxTokens = usage
    ? Math.max(usage.by_type.embedding_document, usage.by_type.embedding_query, usage.by_type.generation, 1)
    : 1;

  return (
    <AppShell>
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your account and data.
          </p>
        </div>

        {/* Token Usage Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Token Usage</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingUsage ? (
              <div className="space-y-3">
                <div className="h-4 w-32 bg-muted animate-pulse rounded" />
                <div className="h-6 bg-muted animate-pulse rounded" />
                <div className="h-6 bg-muted animate-pulse rounded" />
                <div className="h-6 bg-muted animate-pulse rounded" />
              </div>
            ) : usage ? (
              <div className="space-y-4">
                <p className="text-2xl font-semibold font-data">
                  {usage.total_tokens.toLocaleString()}
                  <span className="text-sm font-normal text-muted-foreground ml-1">total tokens</span>
                </p>

                {/* Bar chart */}
                <div className="space-y-3">
                  {Object.entries(usage.by_type).map(([type, tokens]) => (
                    <div key={type}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-muted-foreground">{TYPE_LABELS[type]}</span>
                        <span className="font-data text-xs text-foreground">{tokens.toLocaleString()}</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${TYPE_COLORS[type]}`}
                          style={{ width: `${(tokens / maxTokens) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No usage data available.</p>
            )}
          </CardContent>
        </Card>

        {/* Data Management */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Data</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Export your data</p>
                <p className="text-xs text-muted-foreground">
                  Download documents, conversations, and usage as JSON.
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={handleExport} disabled={exporting}>
                {exporting ? 'Exporting…' : 'Export JSON'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Account */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Account</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Sign out</p>
                <p className="text-xs text-muted-foreground">
                  End your current session.
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={handleSignOut}>
                Sign out
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
