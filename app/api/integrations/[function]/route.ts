import { proxyToFunction } from '@/lib/supabase/function-proxy.server';

/**
 * The same-origin bridge for the integration functions (06 §3).
 *
 * A separate allowlist from `/api/ai/[function]` rather than a longer one, because these are the
 * calls that act on a student's *other* accounts. Nothing here is reachable signed-out; each
 * function checks that for itself.
 */
const FUNCTIONS = new Set(['notion-push', 'notion-search', 'drive-push']);

export async function POST(request: Request, context: { params: Promise<{ function: string }> }) {
  return proxyToFunction(request, (await context.params).function, FUNCTIONS);
}

export async function GET(request: Request, context: { params: Promise<{ function: string }> }) {
  return proxyToFunction(request, (await context.params).function, FUNCTIONS);
}
