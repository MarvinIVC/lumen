import { createClient } from '@supabase/supabase-js';

import { clientEnv } from '@/lib/env';
import type { NoteDocument } from '@/lib/ai/schema';

/**
 * Reading a shared note, as a stranger (06 §4).
 *
 * The whole public surface is `shared_note()`, a security-definer function — `anon` holds no grant
 * on `note` or on `share`, so there is nothing else to read and nothing to get wrong. Revoke,
 * expiry and rate limiting are all evaluated inside it, on every call.
 *
 * A plain anon client, deliberately: this request carries no session and must not pick one up from
 * cookies. A share page rendered differently for its owner would be a share page nobody could check.
 */
export interface SharedNote {
  title: string;
  doc: NoteDocument;
  allowIndex: boolean;
  ogPath: string | null;
  createdAt: string;
}

export type SharedNoteResult = { ok: true; note: SharedNote } | { ok: false; throttled?: boolean };

export async function readSharedNote(shareId: string): Promise<SharedNoteResult> {
  const supabase = createClient(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { data, error } = await supabase.rpc('shared_note', { p_share_id: shareId });
  if (error || !data || typeof data !== 'object') return { ok: false };

  const payload = data as {
    ok?: boolean;
    throttled?: boolean;
    title?: string;
    doc?: NoteDocument;
    allowIndex?: boolean;
    ogPath?: string | null;
    createdAt?: string;
  };

  if (!payload.ok || !payload.doc) {
    return payload.throttled ? { ok: false, throttled: true } : { ok: false };
  }

  return {
    ok: true,
    note: {
      title: payload.title ?? 'Study guide',
      doc: payload.doc,
      allowIndex: payload.allowIndex ?? false,
      ogPath: payload.ogPath ?? null,
      createdAt: payload.createdAt ?? new Date().toISOString(),
    },
  };
}

/** The public URL of a share card, which is a public bucket and needs no signing. */
export function shareCardUrl(ogPath: string): string {
  return `${clientEnv.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/share-cards/${ogPath}`;
}
