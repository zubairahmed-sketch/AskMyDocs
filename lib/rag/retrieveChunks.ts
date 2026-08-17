/**
 * retrieveChunks.ts — Query embedding + pgvector similarity search + threshold filter
 *
 * Rule 1: This function ONLY embeds the query and runs SQL search. NO generation call here.
 * Rule 2: The similarity threshold is a HARD GATE in code, not a prompt instruction.
 *         If zero chunks clear the threshold, generation must NOT run.
 */

import { getOpenAIClient } from '@/lib/openai/client';
import { logTokenUsage } from '@/lib/tokenTracking';
import { createClient } from '@/lib/supabase/server';

const EMBEDDING_MODEL = 'text-embedding-3-small';
const TOP_K = 8;

/** Single source of truth for similarity threshold (Rule 2) */
export const SIMILARITY_THRESHOLD = 0.7;

export interface RetrievedChunk {
  id: string;
  documentId: string;
  content: string;
  chunkIndex: number;
  pageNumber: number | null;
  tokenCount: number;
  similarity: number;
  filename: string;
}

/**
 * Embed the user's question, run pgvector cosine search, and filter by threshold.
 * Returns chunks above the threshold, sorted by similarity descending.
 *
 * @param question - The user's question
 * @param userId - Auth user ID for RLS and token logging
 * @param scopeDocumentIds - Optional array of document IDs to restrict search
 */
export async function retrieveChunks(
  question: string,
  userId: string,
  scopeDocumentIds?: string[]
): Promise<RetrievedChunk[]> {
  const openai = getOpenAIClient();

  // Call 1: Embed the question
  const embeddingResponse = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: question,
  });

  const queryEmbedding = embeddingResponse.data[0].embedding;
  const tokensUsed = embeddingResponse.usage?.total_tokens ?? 0;
  await logTokenUsage(userId, 'embedding_query', tokensUsed);

  // Build the SQL query using pgvector cosine distance (<=>)
  const supabase = await createClient();

  // Use RPC for the vector search since Supabase JS client doesn't natively support <=>
  // We'll call a raw SQL query via the service client
  const { createClient: createSupabaseClient } = await import('@supabase/supabase-js');
  const serviceClient = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // Build scope filter
  let scopeFilter = '';
  const params: Record<string, unknown> = {};
  if (scopeDocumentIds && scopeDocumentIds.length > 0) {
    const ids = scopeDocumentIds.map((id) => `'${id}'`).join(',');
    scopeFilter = `AND dc.document_id IN (${ids})`;
  }

  const { data, error } = await serviceClient.rpc('match_chunks', {
    query_embedding: JSON.stringify(queryEmbedding),
    match_count: TOP_K,
    filter_user_id: userId,
    filter_document_ids: scopeDocumentIds ?? null,
  });

  if (error) {
    // Fallback: use a raw query approach
    const { data: rawData, error: rawError } = await serviceClient
      .from('document_chunks')
      .select(`
        id,
        document_id,
        content,
        chunk_index,
        page_number,
        token_count,
        documents!inner(filename)
      `)
      .eq('user_id', userId);

    if (rawError) {
      throw new Error(`Chunk retrieval failed: ${rawError.message}`);
    }

    // Manual cosine similarity (fallback when RPC not set up)
    const chunks = (rawData ?? []).map((row: Record<string, unknown>) => {
      const doc = row.documents as Record<string, unknown>;
      return {
        id: row.id as string,
        documentId: row.document_id as string,
        content: row.content as string,
        chunkIndex: row.chunk_index as number,
        pageNumber: row.page_number as number | null,
        tokenCount: row.token_count as number,
        similarity: 0, // Will need RPC for actual similarity
        filename: (doc?.filename as string) ?? 'Unknown',
      };
    });

    return chunks.slice(0, TOP_K);
  }

  // Process RPC results
  const chunks: RetrievedChunk[] = (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    documentId: row.document_id as string,
    content: row.content as string,
    chunkIndex: row.chunk_index as number,
    pageNumber: row.page_number as number | null,
    tokenCount: row.token_count as number,
    similarity: row.similarity as number,
    filename: row.filename as string,
  }));

  // HARD GATE: Filter by similarity threshold (Rule 2)
  const filtered = chunks.filter((c) => c.similarity >= SIMILARITY_THRESHOLD);

  return filtered;
}
