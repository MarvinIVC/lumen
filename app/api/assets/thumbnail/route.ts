import { requireSupabaseUser } from '@/lib/supabase/require-user.server';

export async function POST(request: Request) {
  const auth = await requireSupabaseUser();
  if (!auth) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const body = await request.formData().catch(() => null);
  const file = body?.get('file');
  const localId = body?.get('localId');
  if (!(file instanceof File) || typeof localId !== 'string' || file.size > 512_000) {
    return Response.json({ error: 'invalid_thumbnail' }, { status: 400 });
  }
  const note = await auth.supabase
    .from('note')
    .select('id')
    .eq('owner', auth.user.id)
    .eq('local_id', localId)
    .maybeSingle();
  if (!note.data) return Response.json({ error: 'note_not_found' }, { status: 404 });

  const path = `${auth.user.id}/${note.data.id}/thumbnail.svg`;
  const uploaded = await auth.supabase.storage.from('note-assets').upload(path, file, {
    contentType: 'image/svg+xml',
    cacheControl: '3600',
    upsert: true,
  });
  if (uploaded.error) return Response.json({ error: 'upload_failed' }, { status: 500 });
  /**
   * The revision goes back to the browser, and it has to.
   *
   * This is the one write to `note` that does not go through `sync_note`, and the `before update`
   * trigger advances `sync_revision` for it like any other. A client that kept the revision it had
   * before the upload would send a stale base on its very next edit — and `sync_note` would do
   * exactly what it is built to do and file that edit as a conflicted copy of the student's own
   * note, on one device, with nobody else involved.
   */
  const updated = await auth.supabase
    .from('note')
    .update({ thumbnail_path: path })
    .eq('id', note.data.id)
    .select('sync_revision,updated_at')
    .single();
  if (updated.error) return Response.json({ error: 'update_failed' }, { status: 500 });
  return Response.json({
    path,
    revision: updated.data.sync_revision,
    updatedAt: updated.data.updated_at,
  });
}
