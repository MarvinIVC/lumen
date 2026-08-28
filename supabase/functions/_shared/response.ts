/**
 * Shared response helpers for every Lumen edge function.
 *
 * Errors are always JSON with a stable `error` code, because the client branches on it: a quota
 * refusal and a kill-switch refusal are different messages to the student (02-ARCHITECTURE.md §7).
 */
import { corsHeaders } from './cors.ts';

export type Handler = (request: Request) => Response | Promise<Response>;

export function json(request: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...corsHeaders(request) },
  });
}

export function error(request: Request, code: string, message: string, status: number): Response {
  return json(request, { error: code, message }, status);
}

/**
 * The phase-00 stub response. Every function returns this until its own phase implements it, so
 * the deploy pipeline and the client wiring can be verified before any of them do real work.
 */
export function notImplemented(
  request: Request,
  fn: string,
  todo: string,
  phase: string,
): Response {
  return json(
    request,
    {
      error: 'not_implemented',
      function: fn,
      message: `${fn} is not implemented yet.`,
      todo,
      phase,
    },
    501,
  );
}

/** Wraps a handler with the CORS preflight and a last-resort error boundary. */
export function serve(handler: Handler): void {
  Deno.serve(async (request: Request) => {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }
    try {
      return await handler(request);
    } catch (cause) {
      console.error(cause);
      return error(request, 'internal_error', 'Something went wrong on our side.', 500);
    }
  });
}
