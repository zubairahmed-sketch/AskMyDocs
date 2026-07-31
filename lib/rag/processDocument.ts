/**
 * processDocument.ts — Document processing orchestrator
 *
 * Runs after the upload response has been sent to the client (via Next.js `after()`).
 * Phase 1: extract text and update status.
 * Phase 2-3 will add chunking and embedding here.
 *
 * Per SPEC Rule 10: processing must not block the upload request.
 */

import { createClient } from '@supabase/supabase-js';
import { downloadFile } from '@/lib/supabase/storage';
import { extractText } from '@/lib/rag/extractText';

/**
 * Process a document after upload: extract text and update status.
 *
 * @param documentId - The UUID of the document row
 * @param storagePath - The Supabase Storage path to the uploaded file
 * @param fileType - The file type ('pdf', 'txt', 'md')
 */
export async function processDocument(
  documentId: string,
  storagePath: string,
  fileType: string
): Promise<void> {
  // Use service role client to bypass RLS for background processing
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );

  try {
    // 1. Download the file from Supabase Storage
    const buffer = await downloadFile(supabase, storagePath);

    // 2. Extract text (page-aware for PDFs)
    const result = await extractText(buffer, fileType);

    if (result.pages.length === 0) {
      throw new Error('No text content could be extracted from the document.');
    }

    // 3. Update document status to 'ready' with page count
    // Phase 2-3 will add chunking + embedding between steps 2 and 3
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
      `[processDocument] Document ${documentId} processed successfully. ` +
      `Pages: ${result.pageCount}, Text segments: ${result.pages.length}`
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown processing error';
    console.error(`[processDocument] Failed to process document ${documentId}:`, errorMessage);

    // Update status to 'failed' with error message
    await supabase
      .from('documents')
      .update({
        status: 'failed',
        error_message: errorMessage,
      })
      .eq('id', documentId);
  }
}
