/**
 * chunkText.ts — Paragraph-aware text chunking with token counting
 *
 * Splits extracted text into ~500-token chunks with ~75-token overlap.
 * Uses js-tiktoken for accurate token counting (Rule 8).
 * Preserves page_number and chunk_index per chunk (Rule 3).
 */

import { encodingForModel } from 'js-tiktoken';

const TARGET_CHUNK_TOKENS = 500;
const OVERLAP_TOKENS = 75;

export interface TextChunk {
  content: string;
  chunkIndex: number;
  pageNumber: number | null;
  tokenCount: number;
}

interface PageText {
  pageNumber: number | null;
  text: string;
}

// Use cl100k_base which is the encoding for text-embedding-3-small
const encoder = encodingForModel('gpt-4o-mini');

function countTokens(text: string): number {
  return encoder.encode(text).length;
}

/**
 * Split text into paragraphs. Preserves meaningful breaks
 * while handling various line-ending styles.
 */
function splitIntoParagraphs(text: string): string[] {
  // Split on double newlines (paragraph boundaries)
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  return paragraphs;
}

/**
 * Merge paragraphs into chunks of ~TARGET_CHUNK_TOKENS with ~OVERLAP_TOKENS overlap.
 * Each chunk carries the page_number of the page it primarily came from.
 */
function mergeIntoChunks(
  paragraphs: { text: string; pageNumber: number | null }[]
): TextChunk[] {
  const chunks: TextChunk[] = [];
  let currentTexts: string[] = [];
  let currentTokens = 0;
  let currentPage: number | null = null;
  let chunkIndex = 0;

  for (const para of paragraphs) {
    const paraTokens = countTokens(para.text);

    // If a single paragraph exceeds the target, split it by sentences
    if (paraTokens > TARGET_CHUNK_TOKENS && currentTexts.length === 0) {
      const sentenceChunks = splitLongParagraph(para.text, para.pageNumber, chunkIndex);
      for (const sc of sentenceChunks) {
        chunks.push(sc);
        chunkIndex++;
      }
      continue;
    }

    // If adding this paragraph would exceed the target, finalize current chunk
    if (currentTokens + paraTokens > TARGET_CHUNK_TOKENS && currentTexts.length > 0) {
      const content = currentTexts.join('\n\n');
      chunks.push({
        content,
        chunkIndex,
        pageNumber: currentPage,
        tokenCount: countTokens(content),
      });
      chunkIndex++;

      // Overlap: keep the last paragraph(s) that fit within OVERLAP_TOKENS
      const overlapTexts: string[] = [];
      let overlapCount = 0;
      for (let i = currentTexts.length - 1; i >= 0; i--) {
        const t = countTokens(currentTexts[i]);
        if (overlapCount + t > OVERLAP_TOKENS) break;
        overlapTexts.unshift(currentTexts[i]);
        overlapCount += t;
      }

      currentTexts = overlapTexts;
      currentTokens = overlapCount;
    }

    currentTexts.push(para.text);
    currentTokens += paraTokens;
    // Track the page of the first substantial content in this chunk
    if (currentPage === null || para.pageNumber !== null) {
      currentPage = para.pageNumber;
    }
  }

  // Flush remaining
  if (currentTexts.length > 0) {
    const content = currentTexts.join('\n\n');
    chunks.push({
      content,
      chunkIndex,
      pageNumber: currentPage,
      tokenCount: countTokens(content),
    });
  }

  return chunks;
}

/**
 * Split a paragraph that's too long into sentence-level chunks.
 */
function splitLongParagraph(
  text: string,
  pageNumber: number | null,
  startIndex: number
): TextChunk[] {
  // Split by sentence boundaries
  const sentences = text.match(/[^.!?]+[.!?]+[\s]*/g) || [text];
  const chunks: TextChunk[] = [];
  let current: string[] = [];
  let currentTokens = 0;
  let idx = startIndex;

  for (const sentence of sentences) {
    const sentTokens = countTokens(sentence);

    if (currentTokens + sentTokens > TARGET_CHUNK_TOKENS && current.length > 0) {
      const content = current.join('').trim();
      if (content.length > 0) {
        chunks.push({
          content,
          chunkIndex: idx,
          pageNumber,
          tokenCount: countTokens(content),
        });
        idx++;
      }
      current = [];
      currentTokens = 0;
    }

    current.push(sentence);
    currentTokens += sentTokens;
  }

  if (current.length > 0) {
    const content = current.join('').trim();
    if (content.length > 0) {
      chunks.push({
        content,
        chunkIndex: idx,
        pageNumber,
        tokenCount: countTokens(content),
      });
    }
  }

  return chunks;
}

/**
 * Chunk extracted pages into ~500-token chunks with ~75-token overlap.
 *
 * @param pages - Array of {pageNumber, text} from extractText()
 * @returns Array of TextChunk with content, chunkIndex, pageNumber, tokenCount
 */
export function chunkText(pages: PageText[]): TextChunk[] {
  // Flatten pages into paragraphs, each tagged with its page number
  const allParagraphs: { text: string; pageNumber: number | null }[] = [];

  for (const page of pages) {
    const paragraphs = splitIntoParagraphs(page.text);
    for (const p of paragraphs) {
      allParagraphs.push({ text: p, pageNumber: page.pageNumber });
    }
  }

  if (allParagraphs.length === 0) {
    return [];
  }

  return mergeIntoChunks(allParagraphs);
}
