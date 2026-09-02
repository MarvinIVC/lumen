import { requireSupabaseUser } from '@/lib/supabase/require-user.server';

export const dynamic = 'force-dynamic';

/**
 * Which integrations are connected, and where this course last went.
 *
 * Reads as the user, so the column grants from `0004` apply: `meta` and `account_label` come back,
 * `token_ciphertext` cannot. That is phase-06 #8 applied to the second secret — a signed-in
 * browser cannot read its own Notion token, and this endpoint is the proof that it does not need to.
 */
export async function GET(request: Request) {
  const session = await requireSupabaseUser();
  if (!session) return Response.json({ integrations: [] });

  const courseKey = new URL(request.url).searchParams.get('course') ?? '';
  const { data, error } = await session.supabase
    .from('integration')
    .select('kind, meta, account_label, revoked')
    .eq('owner', session.user.id);

  if (error) return Response.json({ integrations: [] });

  return Response.json({
    integrations: (data ?? []).map((row) => {
      const meta = (row.meta ?? {}) as {
        courses?: Record<string, { title?: string }>;
        folders?: Record<string, string>;
      };
      return {
        kind: row.kind,
        connected: !row.revoked,
        revoked: row.revoked,
        accountLabel: row.account_label,
        target:
          row.kind === 'notion'
            ? (meta.courses?.[courseKey]?.title ?? null)
            : meta.folders?.[courseKey]
              ? `Lumen ▸ ${courseKey}`
              : null,
      };
    }),
  });
}

export async function DELETE(request: Request) {
  const session = await requireSupabaseUser();
  if (!session) return Response.json({ error: 'signed_out' }, { status: 401 });

  const kind = new URL(request.url).searchParams.get('kind');
  if (kind !== 'notion' && kind !== 'drive') {
    return Response.json({ error: 'unknown_kind' }, { status: 400 });
  }

  // A delete rather than a flag: disconnecting is the student saying "forget this", and leaving a
  // row with a mapping in it would silently reconnect them to the same database next time.
  const { error } = await session.supabase
    .from('integration')
    .delete()
    .eq('owner', session.user.id)
    .eq('kind', kind);

  if (error) return Response.json({ error: 'disconnect_failed' }, { status: 500 });
  return Response.json({ ok: true });
}
