/**
 * /api/documents — POST upload, GET list
 *
 * POST: Accept multipart file upload (PDF, TXT, MD only), store in Supabase Storage,
 *       insert documents row with status='processing', return immediately.
 *       Uses after() to fire extraction pipeline after response is sent (Rule 10).
 *
 * GET: List user's documents with status.
 */

import { NextResponse } from 'next/server';
import { after } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/server';
import { uploadFile } from '@/lib/supabase/storage';
import { processDocument } from '@/lib/rag/processDocument';
import { z } from 'zod';

const ALLOWED_TYPES = ['application/pdf', 'text/plain', 'text/markdown'] as const;
const ALLOWED_EXTENSIONS = ['pdf', 'txt', 'md'] as const;
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

function getFileType(filename: string, mimeType: string): string | null {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (ext && (ALLOWED_EXTENSIONS as readonly string[]).includes(ext)) {
    return ext;
  }
  // Fallback to MIME type check
  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType === 'text/plain') return 'txt';
  if (mimeType === 'text/markdown') return 'md';
  return null;
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    // Verify auth
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse multipart form data
    const formData = await request.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: 'No file provided. Send a file in the "file" field.' },
        { status: 400 }
      );
    }

    // Validate file type
    const fileType = getFileType(file.name, file.type);
    if (!fileType) {
      return NextResponse.json(
        { error: `Unsupported file type. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}` },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File too large. Maximum size: ${MAX_FILE_SIZE / 1024 / 1024}MB` },
        { status: 400 }
      );
    }

    // Upload to Supabase Storage
    const serviceClient = createServiceClient();
    const { storagePath } = await uploadFile(serviceClient, user.id, file);

    // Insert document row with status='processing'
    const { data: document, error: insertError } = await serviceClient
      .from('documents')
      .insert({
        user_id: user.id,
        filename: file.name,
        file_type: fileType,
        storage_path: storagePath,
        status: 'processing',
      })
      .select()
      .single();

    if (insertError) {
      // Clean up: remove the uploaded file if DB insert fails
      await serviceClient.storage.from('documents').remove([storagePath]);
      throw new Error(`Failed to create document record: ${insertError.message}`);
    }

    // Fire background processing AFTER the response is sent (Rule 10)
    after(async () => {
      await processDocument(document.id, storagePath, fileType);
    });

    // Return immediately — don't wait for processing
    return NextResponse.json(
      {
        id: document.id,
        filename: document.filename,
        file_type: document.file_type,
        status: document.status,
        created_at: document.created_at,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('[POST /api/documents]', error);
    const message = error instanceof Error ? error.message : 'Upload failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const supabase = await createClient();

    // Verify auth
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch documents ordered by newest first
    const { data: documents, error: fetchError } = await supabase
      .from('documents')
      .select('id, filename, file_type, status, page_count, error_message, created_at')
      .order('created_at', { ascending: false });

    if (fetchError) {
      throw new Error(`Failed to fetch documents: ${fetchError.message}`);
    }

    return NextResponse.json({ documents: documents ?? [] });
  } catch (error) {
    console.error('[GET /api/documents]', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch documents';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
