'use client';

import { useCallback, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

interface UploadZoneProps {
  onUploadComplete: () => void;
}

const ACCEPTED_TYPES = ['.pdf', '.txt', '.md'];
const ACCEPTED_MIME = ['application/pdf', 'text/plain', 'text/markdown'];
const MAX_SIZE_MB = 20;

interface UploadState {
  status: 'idle' | 'uploading' | 'success' | 'error';
  progress: number;
  error: string | null;
  filename: string | null;
}

function validateFile(file: File): string | null {
  const ext = '.' + file.name.split('.').pop()?.toLowerCase();
  if (!ACCEPTED_TYPES.includes(ext)) {
    return `Unsupported type "${ext}". Allowed: ${ACCEPTED_TYPES.join(', ')}`;
  }
  if (file.size > MAX_SIZE_MB * 1024 * 1024) {
    return `File too large. Maximum size is ${MAX_SIZE_MB}MB.`;
  }
  return null;
}

export function UploadZone({ onUploadComplete }: UploadZoneProps) {
  const [state, setState] = useState<UploadState>({
    status: 'idle',
    progress: 0,
    error: null,
    filename: null,
  });
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadFile = useCallback(async (file: File) => {
    const validationError = validateFile(file);
    if (validationError) {
      setState({ status: 'error', progress: 0, error: validationError, filename: file.name });
      return;
    }

    setState({ status: 'uploading', progress: 10, error: null, filename: file.name });

    try {
      const formData = new FormData();
      formData.append('file', file);

      // Simulate progress since fetch doesn't expose upload progress
      const progressInterval = setInterval(() => {
        setState((prev) =>
          prev.progress < 80
            ? { ...prev, progress: prev.progress + 10 }
            : prev
        );
      }, 300);

      const response = await fetch('/api/documents', {
        method: 'POST',
        body: formData,
      });

      clearInterval(progressInterval);

      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: 'Upload failed' }));
        setState({
          status: 'error',
          progress: 0,
          error: data.error ?? 'Upload failed. Please try again.',
          filename: file.name,
        });
        return;
      }

      setState({ status: 'success', progress: 100, error: null, filename: file.name });

      // Notify parent to refresh list
      onUploadComplete();

      // Reset to idle after a moment
      setTimeout(() => {
        setState({ status: 'idle', progress: 0, error: null, filename: null });
      }, 2500);
    } catch {
      setState({
        status: 'error',
        progress: 0,
        error: 'Network error. Check your connection and try again.',
        filename: file.name,
      });
    }
  }, [onUploadComplete]);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) uploadFile(file);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
    // Reset so same file can be re-selected
    e.target.value = '';
  }

  const isUploading = state.status === 'uploading';

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        onClick={() => !isUploading && fileInputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && !isUploading && fileInputRef.current?.click()}
        aria-label="Upload document — click or drag and drop"
        className={cn(
          'relative rounded-xl border-2 border-dashed transition-all duration-200 cursor-pointer',
          'flex flex-col items-center justify-center gap-3 px-6 py-10',
          isDragOver
            ? 'border-primary bg-primary/5 scale-[1.01]'
            : 'border-border hover:border-primary/50 hover:bg-muted/40',
          isUploading && 'pointer-events-none opacity-70',
        )}
      >
        {/* Upload icon */}
        <div className={cn(
          'w-12 h-12 rounded-full flex items-center justify-center transition-colors',
          isDragOver ? 'bg-primary/10' : 'bg-muted'
        )}>
          <svg
            className={cn('w-5 h-5 transition-colors', isDragOver ? 'text-primary' : 'text-muted-foreground')}
            fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
          </svg>
        </div>

        <div className="text-center">
          <p className="text-sm font-medium text-foreground">
            {isDragOver ? 'Drop your file here' : 'Drag & drop or click to upload'}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            PDF, TXT, or Markdown — up to {MAX_SIZE_MB}MB
          </p>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_TYPES.join(',')}
          onChange={handleFileChange}
          className="sr-only"
          id="document-upload"
          aria-hidden="true"
        />
      </div>

      {/* Upload progress / feedback */}
      {state.status === 'uploading' && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="truncate max-w-[70%]">{state.filename}</span>
            <span className="font-data">{state.progress}%</span>
          </div>
          <Progress value={state.progress} className="h-1.5" />
        </div>
      )}

      {state.status === 'success' && (
        <div className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-700">
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
          </svg>
          <span>
            <strong className="font-medium truncate">{state.filename}</strong> uploaded — processing…
          </span>
        </div>
      )}

      {state.status === 'error' && (
        <div className="flex items-start gap-2 rounded-lg bg-destructive/5 border border-destructive/20 px-3 py-2 text-sm text-destructive">
          <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          <span>{state.error}</span>
        </div>
      )}
    </div>
  );
}
