/**
 * embedChunks.ts — Batched embedding calls (Rule 4)
 *
 * Groups chunks into batches of ~50 and calls text-embedding-3-small
 * once per batch, not once per chunk. Inserts into document_chunks.
 * Logs tokens as 'embedding_document' after each batch (Rule 11).
 */

import { getOpenAIClient } from '@/lib/openai/client';
import { logTokenUsage } from '@/lib/tokenTracking';
import { createClient } from '@supabase/supabase-js';
import type { TextChunk } from '@/lib/rag/chunkText';

const BATCH_SIZE = 50;
const EMBEDDING_MODEL = 'text-embedding-3-small';

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

/**
 * Embed all chunks in batches and insert into document_chunks.
 */
export async function embedChunks(
  userId: string,
  documentId: string,
  chunks: TextChunk[]
): Promise<void> {
  const openai = getOpenAIClient();
  const supabase = getServiceClient();

  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);
    const texts = batch.map((c) => c.content);

    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: texts,
    });

    // Log token usage (Rule 11)
    const totalTokens = response.usage?.total_tokens ?? 0;
    await logTokenUsage(userId, 'embedding_document', totalTokens);

    // Prepare rows for insertion
    const rows = batch.map((chunk, idx) => ({
      document_id: documentId,
      user_id: userId,
      content: chunk.content,
      chunk_index: chunk.chunkIndex,
      page_number: chunk.pageNumber,
      token_count: chunk.tokenCount,
      embedding: JSON.stringify(response.data[idx].embedding),
    }));

    const { error } = await supabase.from('document_chunks').insert(rows);

    if (error) {
      throw new Error(`Failed to insert chunk batch: ${error.message}`);
    }
  }
}
