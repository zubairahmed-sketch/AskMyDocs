/**
 * /api/documents/[id] — GET status, DELETE with cascade
 */

import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: document, error: fetchError } = await supabase
      .from('documents')
      .select('id, filename, file_type, status, page_count, error_message, created_at')
      .eq('id', id)
      .single();

    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
        return NextResponse.json({ error: 'Document not found' }, { status: 404 });
      }
      throw new Error(`Failed to fetch document: ${fetchError.message}`);
    }

    return NextResponse.json({ document });
  } catch (error) {
    console.error('[GET /api/documents/[id]]', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch document';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // First, get the document to find its storage path
    const { data: document, error: fetchError } = await supabase
      .from('documents')
      .select('id, storage_path')
      .eq('id', id)
      .single();

    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
        return NextResponse.json({ error: 'Document not found' }, { status: 404 });
      }
      throw new Error(`Failed to fetch document: ${fetchError.message}`);
    }

    // Use service client to delete storage object (bypasses RLS on storage)
    const serviceClient = createServiceClient();

    // Delete the storage object
    const { error: storageError } = await serviceClient.storage
      .from('documents')
      .remove([document.storage_path]);

    if (storageError) {
      console.error('[DELETE /api/documents/[id]] Storage delete failed:', storageError.message);
      // Continue with DB delete even if storage delete fails
    }

    // Delete the document row (cascades to document_chunks via ON DELETE CASCADE)
    const { error: deleteError } = await serviceClient
      .from('documents')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (deleteError) {
      throw new Error(`Failed to delete document: ${deleteError.message}`);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[DELETE /api/documents/[id]]', error);
    const message = error instanceof Error ? error.message : 'Failed to delete document';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
