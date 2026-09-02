import { requireSupabaseUser } from '@/lib/supabase/require-user.server';

export const dynamic = 'force-dynamic';

/**
 * Creating, updating and revoking a share link (06 §4).
 *
 * Same-origin, so the browser never holds a Supabase token — phase-06's boundary. Every statement
 * here runs as the *user*, not the service role, so `share_owner` is what actually decides whether
 * this is their note to share: a request naming somebody else's note writes nothing, because the
 * insert's `owner` is taken from the session rather than from the body.
 *
 * A share can only be made for a note that is already in the cloud. That is not a restriction we
 * chose so much as one the shape of the product implies — a signed-out note exists only in one
 * browser's IndexedDB, and there is nothing for a stranger's request to read.
 */

/** Short, unguessable, and readable out loud if it has to be. No ambiguous glyphs. */
const ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';

function newShareId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return [...bytes].map((byte) => ALPHABET[byte % ALPHABET.length]).join('');
}

export async function POST(request: Request) {
  const session = await requireSupabaseUser();
  if (!session) return Response.json({ error: 'signed_out' }, { status: 401 });
  const { supabase, user } = session;

  const body = (await request.json().catch(() => ({}))) as {
    localId?: string;
    allowIndex?: boolean;
    expiresAt?: string | null;
  };
  if (!body.localId) return Response.json({ error: 'local_id_required' }, { status: 400 });

  // By `local_id` and owner, because the browser addresses its notes by the id it minted and has
  // no reason to know the cloud uuid. RLS means a `local_id` that is not theirs simply is not found.
  const { data: note, error: noteError } = await supabase
    .from('note')
    .select('id')
    .eq('owner', user.id)
    .eq('local_id', body.localId)
    .maybeSingle();

  if (noteError) return Response.json({ error: 'lookup_failed' }, { status: 500 });
  if (!note) return Response.json({ error: 'not_synced' }, { status: 404 });

  // One live link per note. A second "Create link" press should hand back the link they already
  // have rather than quietly orphaning it — a student who shared the first one would never know it
  // had stopped being the one the dialog shows.
  const { data: existing } = await supabase
    .from('share')
    .select('id, allow_index, expires_at, og_path')
    .eq('note', note.id)
    .eq('revoked', false)
    .maybeSingle();

  if (existing) {
    return Response.json({
      id: existing.id,
      allowIndex: existing.allow_index,
      expiresAt: existing.expires_at,
      hasCard: Boolean(existing.og_path),
      reused: true,
    });
  }

  const id = newShareId();
  const { error } = await supabase.from('share').insert({
    id,
    note: note.id,
    owner: user.id,
    allow_index: body.allowIndex ?? false,
    expires_at: body.expiresAt ?? null,
  });
  if (error) return Response.json({ error: 'create_failed' }, { status: 500 });

  return Response.json({
    id,
    allowIndex: body.allowIndex ?? false,
    expiresAt: body.expiresAt ?? null,
    hasCard: false,
    reused: false,
  });
}

export async function PATCH(request: Request) {
  const session = await requireSupabaseUser();
  if (!session) return Response.json({ error: 'signed_out' }, { status: 401 });
  const { supabase, user } = session;

  const body = (await request.json().catch(() => ({}))) as {
    id?: string;
    allowIndex?: boolean;
    expiresAt?: string | null;
  };
  if (!body.id) return Response.json({ error: 'id_required' }, { status: 400 });

  const patch: Record<string, unknown> = {};
  if (typeof body.allowIndex === 'boolean') patch.allow_index = body.allowIndex;
  if (body.expiresAt !== undefined) patch.expires_at = body.expiresAt;
  if (!Object.keys(patch).length) return Response.json({ ok: true });

  const { error } = await supabase
    .from('share')
    .update(patch)
    .eq('id', body.id)
    .eq('owner', user.id);
  if (error) return Response.json({ error: 'update_failed' }, { status: 500 });
  return Response.json({ ok: true });
}

/**
 * Revoke. The row is kept rather than deleted so the id can never be re-minted for a different
 * note — and so a student who revokes by accident has something to look at.
 */
export async function DELETE(request: Request) {
  const session = await requireSupabaseUser();
  if (!session) return Response.json({ error: 'signed_out' }, { status: 401 });
  const { supabase, user } = session;

  const id = new URL(request.url).searchParams.get('id');
  if (!id) return Response.json({ error: 'id_required' }, { status: 400 });

  const { error } = await supabase
    .from('share')
    .update({ revoked: true })
    .eq('id', id)
    .eq('owner', user.id);
  if (error) return Response.json({ error: 'revoke_failed' }, { status: 500 });
  return Response.json({ ok: true });
}

export async function GET(request: Request) {
  const session = await requireSupabaseUser();
  if (!session) return Response.json({ share: null });
  const { supabase, user } = session;

  const localId = new URL(request.url).searchParams.get('localId');
  if (!localId) return Response.json({ error: 'local_id_required' }, { status: 400 });

  const { data: note } = await supabase
    .from('note')
    .select('id')
    .eq('owner', user.id)
    .eq('local_id', localId)
    .maybeSingle();
  if (!note) return Response.json({ share: null });

  const { data: share } = await supabase
    .from('share')
    .select('id, allow_index, expires_at, og_path')
    .eq('note', note.id)
    .eq('revoked', false)
    .maybeSingle();

  return Response.json({
    share: share
      ? {
          id: share.id,
          allowIndex: share.allow_index,
          expiresAt: share.expires_at,
          hasCard: Boolean(share.og_path),
        }
      : null,
  });
}
