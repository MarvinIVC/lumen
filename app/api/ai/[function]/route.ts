import { proxyToFunction } from '@/lib/supabase/function-proxy.server';

/**
 * Same-origin bridge for the AI Edge Functions. The proxy itself lives in
 * `lib/supabase/function-proxy.server.ts`, shared with `/api/integrations/[function]` — the two
 * differ only in which functions they will call, and an allowlist that exists twice is one that
 * will eventually say two different things.
 */
const FUNCTIONS = new Set(['enhance', 'detect', 'ocr', 'ask', 'usage', 'byok', 'delete-account']);

async function proxy(request: Request, name: string): Promise<Response> {
  return proxyToFunction(request, name, FUNCTIONS);
}

export async function GET(request: Request, context: { params: Promise<{ function: string }> }) {
  return proxy(request, (await context.params).function);
}

export async function POST(request: Request, context: { params: Promise<{ function: string }> }) {
  return proxy(request, (await context.params).function);
}

export async function DELETE(request: Request, context: { params: Promise<{ function: string }> }) {
  return proxy(request, (await context.params).function);
}
