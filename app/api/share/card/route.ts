import { requireSupabaseUser } from '@/lib/supabase/require-user.server';

export const dynamic = 'force-dynamic';

/**
 * The Open Graph card for a share link (06 §4).
 *
 * **Rendered in the browser and uploaded, rather than generated on the server.** `next/og` is the
 * obvious tool and it is the one thing this Worker cannot afford: phase-02 put it in the bundle and
 * the deploy failed at 3787 KiB, because it carries resvg and yoga as WebAssembly. The marketing
 * card has been a build-time PNG ever since. A per-share card cannot be built at build time, so it
 * is drawn from the note's own saved thumbnail with a canvas and posted here.
 *
 * The upload runs as the user, under a storage policy that joins `share` to prove the card belongs
 * to them — so this route holds no service-role key and can only ever write the caller's own card.
 */
export async function POST(request: Request) {
  const auth = await requireSupabaseUser();
  if (!auth) return Response.json({ error: 'signed_out' }, { status: 401 });

  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  const id = form?.get('id');

  if (!(file instanceof File) || typeof id !== 'string') {
    return Response.json({ error: 'invalid_card' }, { status: 400 });
  }
  // The bucket caps this too; refusing here means a clear answer rather than a storage error.
  if (file.size > 2_000_000) return Response.json({ error: 'card_too_large' }, { status: 413 });

  const path = `${id}.png`;
  const uploaded = await auth.supabase.storage.from('share-cards').upload(path, file, {
    contentType: 'image/png',
    // A link preview is fetched once by each service and cached by them for a long time; there is
    // no version of this file that changes without the share id changing.
    cacheControl: '604800',
    upsert: true,
  });
  if (uploaded.error) return Response.json({ error: 'upload_failed' }, { status: 500 });

  const { error } = await auth.supabase
    .from('share')
    .update({ og_path: path })
    .eq('id', id)
    .eq('owner', auth.user.id);
  if (error) return Response.json({ error: 'record_failed' }, { status: 500 });

  return Response.json({ ok: true, path });
}
