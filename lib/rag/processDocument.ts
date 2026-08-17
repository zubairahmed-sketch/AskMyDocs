/**
 * processDocument.ts — Document processing orchestrator
 *
 * Runs after upload response is sent (via Next.js after()).
 * Pipeline: extract text → chunk → embed → update status.
 *
 * Rule 10: processing must not block the upload request.
 */

import { createClient } from '@supabase/supabase-js';
import { downloadFile } from '@/lib/supabase/storage';
import { extractText } from '@/lib/rag/extractText';
import { chunkText } from '@/lib/rag/chunkText';
import { embedChunks } from '@/lib/rag/embedChunks';

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

/**
 * Full ingestion pipeline: extract → chunk → embed → update status.
 */
export async function processDocument(
  documentId: string,
  storagePath: string,
  fileType: string,
  userId: string
): Promise<void> {
  const supabase = getServiceClient();

  try {
    // 1. Download file from Supabase Storage
    const buffer = await downloadFile(supabase, storagePath);

    // 2. Extract text (page-aware for PDFs)
    const result = await extractText(buffer, fileType);

    if (result.pages.length === 0) {
      throw new Error('No text content could be extracted from the document.');
    }

    // 3. Chunk text (~500 tokens, ~75 token overlap)
    const chunks = chunkText(result.pages);

    if (chunks.length === 0) {
      throw new Error('Text extraction succeeded but produced no chunks.');
    }

    // 4. Embed chunks in batches and insert into document_chunks
    await embedChunks(userId, documentId, chunks);

    // 5. Update document status to 'ready'
    const { error: updateError } = await supabase
      .from('documents')
      .update({
        status: 'ready',
        page_count: result.pageCount || null,
      })
      .eq('id', documentId);

    if (updateError) {
      throw new Error(`Failed to update document status: ${updateError.message}`);
    }

    console.log(
      `[processDocument] ${documentId} done — ${result.pageCount} pages, ${chunks.length} chunks`
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown processing error';
    console.error(`[processDocument] Failed ${documentId}:`, errorMessage);

    await supabase
      .from('documents')
      .update({ status: 'failed', error_message: errorMessage })
      .eq('id', documentId);
  }
}
