/**
 * OpenAI client singleton — used for embeddings and generation.
 * No LangChain, raw API calls only (Rule 6).
 */

import OpenAI from 'openai';

let client: OpenAI | null = null;

export function getOpenAIClient(): OpenAI {
  if (!client) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is not set.');
    }
    client = new OpenAI({ apiKey });
  }
  return client;
}
