'use client';

import { useState } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { UploadZone } from '@/components/documents/UploadZone';
import { DocumentList } from '@/components/documents/DocumentList';

export default function DocumentsPage() {
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  function handleUploadComplete() {
    // Bump trigger to refresh the document list
    setRefreshTrigger((n) => n + 1);
  }

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        {/* Page header */}
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Documents</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Upload PDFs, text files, or Markdown notes to ask questions about them.
          </p>
        </div>

        {/* Upload zone */}
        <section aria-label="Upload documents">
          <UploadZone onUploadComplete={handleUploadComplete} />
        </section>

        {/* Document library */}
        <section aria-label="Document library">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-3">
            Your Documents
          </h2>
          <DocumentList refreshTrigger={refreshTrigger} />
        </section>
      </div>
    </AppShell>
  );
}
