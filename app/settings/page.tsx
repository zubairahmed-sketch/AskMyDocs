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

interface UserProfile {
  email: string;
  displayName: string;
  initials: string;
  createdAt: string;
  lastSignIn: string;
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

function getInitials(email: string, name?: string): string {
  if (name && name.trim()) {
    return name
      .trim()
      .split(' ')
      .filter(Boolean)
      .map((w) => w[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }
  return email.charAt(0).toUpperCase();
}

function formatDate(iso: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
}

function formatDateTime(iso: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function SettingsPage() {
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [loadingUsage, setLoadingUsage] = useState(true);
  const [exporting, setExporting] = useState(false);

  // Profile state
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState('');
  const [nameSaved, setNameSaved] = useState(false);

  // Sign out state
  const [signingOut, setSigningOut] = useState(false);

  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    // Load usage
    (async () => {
      const res = await fetch('/api/usage');
      if (res.ok) setUsage(await res.json());
      setLoadingUsage(false);
    })();

    // Load user profile
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const email = user.email ?? '';
        const fullName = user.user_metadata?.full_name ?? user.user_metadata?.name ?? '';
        const initials = getInitials(email, fullName);
        setProfile({
          email,
          displayName: fullName || email.split('@')[0],
          initials,
          createdAt: user.created_at ?? '',
          lastSignIn: user.last_sign_in_at ?? '',
        });
        setDisplayName(fullName || email.split('@')[0]);
      }
    })();
  }, [supabase.auth]);

  async function handleSaveName() {
    if (!displayName.trim()) {
      setNameError('Display name cannot be empty.');
      return;
    }
    setSavingName(true);
    setNameError('');
    try {
      const { error } = await supabase.auth.updateUser({
        data: { full_name: displayName.trim() },
      });
      if (error) throw error;
      setProfile((prev) => prev
        ? {
            ...prev,
            displayName: displayName.trim(),
            initials: getInitials(prev.email, displayName.trim()),
          }
        : prev
      );
      setEditingName(false);
      setNameSaved(true);
      setTimeout(() => setNameSaved(false), 3000);
    } catch {
      setNameError('Failed to save. Please try again.');
    } finally {
      setSavingName(false);
    }
  }

  async function handleExport() {
    setExporting(true);
    try {
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

  // Session-based sign out: invalidates the JWT on Supabase's side
  async function handleSignOut() {
    setSigningOut(true);
    try {
      // scope: 'global' revokes ALL sessions across all devices
      // scope: 'local' revokes only the current session/tab
      await supabase.auth.signOut({ scope: 'local' });
      router.push('/login');
      router.refresh();
    } catch {
      setSigningOut(false);
    }
  }

  async function handleSignOutAll() {
    setSigningOut(true);
    try {
      // Revokes all sessions (all devices) by invalidating the refresh token globally
      await supabase.auth.signOut({ scope: 'global' });
      router.push('/login');
      router.refresh();
    } catch {
      setSigningOut(false);
    }
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
            Manage your profile, account, and data.
          </p>
        </div>

        {/* ── Profile Card ── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {profile ? (
              <>
                {/* Avatar + identity row */}
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xl font-bold shrink-0 ring-2 ring-primary/20">
                    {profile.initials}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-base truncate">{profile.displayName}</p>
                    <p className="text-sm text-muted-foreground truncate">{profile.email}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Member since {formatDate(profile.createdAt)}
                    </p>
                  </div>
                </div>

                <div className="border-t border-border" />

                {/* Display name edit */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Display Name</label>
                  {editingName ? (
                    <div className="space-y-2">
                      <input
                        id="display-name-input"
                        type="text"
                        value={displayName}
                        onChange={(e) => { setDisplayName(e.target.value); setNameError(''); }}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') setEditingName(false); }}
                        className="w-full px-3 py-2 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                        placeholder="Enter your display name"
                        autoFocus
                        maxLength={60}
                      />
                      {nameError && (
                        <p className="text-xs text-destructive">{nameError}</p>
                      )}
                      <div className="flex gap-2">
                        <Button size="sm" onClick={handleSaveName} disabled={savingName}>
                          {savingName ? 'Saving…' : 'Save'}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => { setEditingName(false); setDisplayName(profile.displayName); setNameError(''); }}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-foreground">{profile.displayName}</span>
                        {nameSaved && (
                          <span className="text-xs text-emerald-600 font-medium flex items-center gap-1">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                            </svg>
                            Saved
                          </span>
                        )}
                      </div>
                      <Button size="sm" variant="outline" onClick={() => setEditingName(true)}>
                        Edit
                      </Button>
                    </div>
                  )}
                </div>

                {/* Email (read-only) */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Email Address</label>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-foreground">{profile.email}</span>
                    <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">Read-only</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Email is managed by your auth provider and cannot be changed here.</p>
                </div>
              </>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-full bg-muted animate-pulse" />
                  <div className="space-y-2 flex-1">
                    <div className="h-4 w-32 bg-muted animate-pulse rounded" />
                    <div className="h-3 w-48 bg-muted animate-pulse rounded" />
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Token Usage Card ── */}
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

        {/* ── Data Management ── */}
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

        {/* ── Session & Account ── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Session & Account</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Last sign in info */}
            {profile && (
              <div className="flex items-center justify-between py-2 border-b border-border">
                <div>
                  <p className="text-sm font-medium">Last sign-in</p>
                  <p className="text-xs text-muted-foreground">{formatDateTime(profile.lastSignIn)}</p>
                </div>
                <div className="flex items-center gap-1.5 text-emerald-600">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-xs font-medium">Active</span>
                </div>
              </div>
            )}

            {/* Sign out this device */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Sign out</p>
                <p className="text-xs text-muted-foreground">
                  Ends your current session on this device. Your JWT token is revoked.
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={handleSignOut} disabled={signingOut}>
                {signingOut ? 'Signing out…' : 'Sign out'}
              </Button>
            </div>

            {/* Sign out all devices */}
            <div className="flex items-center justify-between pt-2 border-t border-border">
              <div>
                <p className="text-sm font-medium text-destructive">Sign out all devices</p>
                <p className="text-xs text-muted-foreground">
                  Revokes all active sessions globally — every device will be logged out.
                </p>
              </div>
              <Button variant="destructive" size="sm" onClick={handleSignOutAll} disabled={signingOut}>
                {signingOut ? 'Signing out…' : 'Sign out all'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
