/**
 * tokenTracking.ts — Log token usage after every OpenAI call (Rule 11).
 * call_type: 'embedding_document' | 'embedding_query' | 'generation'
 */

import { createClient } from '@supabase/supabase-js';

export type CallType = 'embedding_document' | 'embedding_query' | 'generation';

export async function logTokenUsage(
  userId: string,
  callType: CallType,
  tokensUsed: number
): Promise<void> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { error } = await supabase.from('token_usage_logs').insert({
    user_id: userId,
    call_type: callType,
    tokens_used: tokensUsed,
  });

  if (error) {
    console.error('[logTokenUsage] Failed to log:', error.message);
  }
}
