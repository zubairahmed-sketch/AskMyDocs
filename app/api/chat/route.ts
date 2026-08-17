/**
 * /api/chat — POST ask a question
 *
 * Flow (SPEC section 4):
 * 1. Embed question + pgvector search + threshold filter (retrieveChunks)
 * 2. If zero chunks survive → return refusal message, skip generation
 * 3. If chunks survive → generate answer with citations (generateAnswer)
 * 4. Save message + citations + retrieved_chunks to DB
 */

import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { retrieveChunks, SIMILARITY_THRESHOLD } from '@/lib/rag/retrieveChunks';
import { generateAnswer, REFUSAL_MESSAGE } from '@/lib/rag/generateAnswer';
import { z } from 'zod';

const chatSchema = z.object({
  conversation_id: z.string().uuid(),
  question: z.string().min(1).max(5000),
  scope_document_ids: z.array(z.string().uuid()).optional(),
});

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = chatSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { conversation_id, question, scope_document_ids } = parsed.data;
    const serviceClient = createServiceClient();

    // Save user message
    await serviceClient.from('messages').insert({
      conversation_id,
      role: 'user',
      content: question,
    });

    // Update conversation title from first question
    const { data: existingConv } = await serviceClient
      .from('conversations')
      .select('title')
      .eq('id', conversation_id)
      .single();

    if (!existingConv?.title) {
      await serviceClient
        .from('conversations')
        .update({ title: question.slice(0, 100) })
        .eq('id', conversation_id);
    }

    // Step 1: Retrieve chunks (embed query + pgvector search + threshold filter)
    const retrievedChunks = await retrieveChunks(question, user.id, scope_document_ids);

    // Step 2: Check if any chunks survived the threshold (Rule 2 — HARD GATE)
    if (retrievedChunks.length === 0) {
      // Save refusal as assistant message — no generation call at all
      const { data: refusalMsg } = await serviceClient
        .from('messages')
        .insert({
          conversation_id,
          role: 'assistant',
          content: REFUSAL_MESSAGE,
          citations: null,
          retrieved_chunks: null,
        })
        .select()
        .single();

      return NextResponse.json({
        message: {
          id: refusalMsg?.id,
          role: 'assistant',
          content: REFUSAL_MESSAGE,
          citations: null,
          retrieved_chunks: null,
        },
        refusal: true,
      });
    }

    // Step 3: Generate answer with citations
    const { answer, citations } = await generateAnswer(question, retrievedChunks, user.id);

    // Build full retrieved chunks list for Sources panel (cited and uncited)
    const fullRetrievedChunks = retrievedChunks.map((chunk) => ({
      chunk_id: chunk.id,
      document_id: chunk.documentId,
      filename: chunk.filename,
      page_number: chunk.pageNumber,
      similarity: chunk.similarity,
      excerpt: chunk.content.slice(0, 300),
      cited: citations.some((c) => c.chunkId === chunk.id),
    }));

    // Step 4: Save assistant message with citations
    const { data: assistantMsg } = await serviceClient
      .from('messages')
      .insert({
        conversation_id,
        role: 'assistant',
        content: answer,
        citations: JSON.stringify(citations),
        retrieved_chunks: JSON.stringify(fullRetrievedChunks),
      })
      .select()
      .single();

    return NextResponse.json({
      message: {
        id: assistantMsg?.id,
        role: 'assistant',
        content: answer,
        citations,
        retrieved_chunks: fullRetrievedChunks,
      },
      refusal: false,
    });
  } catch (error) {
    console.error('[POST /api/chat]', error);
    const message = error instanceof Error ? error.message : 'Chat failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
