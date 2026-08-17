/**
 * /api/usage — GET token usage stats for the current user
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get per-type totals
    const { data: usage, error: usageError } = await supabase
      .from('token_usage_logs')
      .select('call_type, tokens_used');

    if (usageError) {
      throw new Error(`Failed to fetch usage: ${usageError.message}`);
    }

    const byType: Record<string, number> = {};
    let total = 0;
    for (const row of usage ?? []) {
      const t = row.tokens_used ?? 0;
      byType[row.call_type] = (byType[row.call_type] ?? 0) + t;
      total += t;
    }

    return NextResponse.json({
      total_tokens: total,
      by_type: {
        embedding_document: byType['embedding_document'] ?? 0,
        embedding_query: byType['embedding_query'] ?? 0,
        generation: byType['generation'] ?? 0,
      },
    });
  } catch (error) {
    console.error('[GET /api/usage]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed' },
      { status: 500 }
    );
  }
}
