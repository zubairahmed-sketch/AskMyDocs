/**
 * generateAnswer.ts — Grounded generation with citation parsing
 *
 * Rule 1: Only called if retrieveChunks() returned chunks above threshold.
 * Rule 5: Citation markers [n] are parsed programmatically and mapped
 *         back to real chunk metadata — never hallucinated by the model.
 */

import { getOpenAIClient } from '@/lib/openai/client';
import { logTokenUsage } from '@/lib/tokenTracking';
import type { RetrievedChunk } from '@/lib/rag/retrieveChunks';

const GENERATION_MODEL = 'gpt-4o-mini';

/** The fixed refusal message when no chunks clear the threshold (SPEC section 9) */
export const REFUSAL_MESSAGE =
  "I couldn't find anything in the documents you've shared that addresses this question. " +
  "You could try rephrasing it, or check that the relevant document has been uploaded and finished processing.";

export interface Citation {
  marker: number;
  chunkId: string;
  documentId: string;
  filename: string;
  pageNumber: number | null;
  similarity: number;
  excerpt: string;
}

export interface GenerationResult {
  answer: string;
  citations: Citation[];
}

/**
 * Build the system prompt with numbered sources, call gpt-4o-mini,
 * and parse [n] citation markers from the response.
 */
export async function generateAnswer(
  question: string,
  chunks: RetrievedChunk[],
  userId: string
): Promise<GenerationResult> {
  const openai = getOpenAIClient();

  // Build numbered source list for the prompt (SPEC section 9)
  const sourcesText = chunks
    .map((chunk, idx) => {
      const pageInfo = chunk.pageNumber ? `, Page ${chunk.pageNumber}` : '';
      return `[${idx + 1}] (Document: ${chunk.filename}${pageInfo}): ${chunk.content}`;
    })
    .join('\n\n');

  const systemPrompt =
    'Answer the user\'s question using ONLY the numbered source excerpts below. ' +
    'When you use information from a source, cite it inline with its number in square brackets, like [1] or [2]. ' +
    'You may cite multiple sources for one sentence if needed. ' +
    'If the excerpts do not contain enough information to answer the question, say so directly and do not guess or use outside knowledge.\n\n' +
    `Sources:\n${sourcesText}`;

  const response = await openai.chat.completions.create({
    model: GENERATION_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: question },
    ],
    temperature: 0.3,
    max_tokens: 1024,
  });

  const answer = response.choices[0]?.message?.content ?? '';
  const tokensUsed =
    (response.usage?.prompt_tokens ?? 0) + (response.usage?.completion_tokens ?? 0);

  await logTokenUsage(userId, 'generation', tokensUsed);

  // Parse [n] citation markers from the response (Rule 5)
  const markerRegex = /\[(\d+)\]/g;
  const citedNumbers = new Set<number>();
  let match: RegExpExecArray | null;
  while ((match = markerRegex.exec(answer)) !== null) {
    citedNumbers.add(parseInt(match[1], 10));
  }

  // Map markers back to actual chunk metadata — a lookup, not a guess (Rule 5)
  const citations: Citation[] = [];
  for (const num of citedNumbers) {
    const idx = num - 1;
    if (idx >= 0 && idx < chunks.length) {
      const chunk = chunks[idx];
      citations.push({
        marker: num,
        chunkId: chunk.id,
        documentId: chunk.documentId,
        filename: chunk.filename,
        pageNumber: chunk.pageNumber,
        similarity: chunk.similarity,
        excerpt: chunk.content.slice(0, 200),
      });
    }
  }

  return { answer, citations };
}
