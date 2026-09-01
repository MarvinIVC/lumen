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
  const updated = await auth.supabase
    .from('note')
    .update({ thumbnail_path: path })
    .eq('id', note.data.id);
  if (updated.error) return Response.json({ error: 'update_failed' }, { status: 500 });
  return Response.json({ path });
}
