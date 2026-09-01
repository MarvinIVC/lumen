import { z } from 'zod';

import { requireSupabaseUser } from '@/lib/supabase/require-user.server';

const Body = z.discriminatedUnion('entity', [
  z.object({
    entity: z.literal('course'),
    operation: z.enum(['upsert', 'delete']),
    entityId: z.string(),
    payload: z.record(z.string(), z.unknown()),
  }),
  z.object({
    entity: z.literal('unit'),
    operation: z.enum(['upsert', 'delete']),
    entityId: z.string(),
    payload: z.record(z.string(), z.unknown()),
  }),
  z.object({
    entity: z.literal('note'),
    operation: z.enum(['upsert', 'delete']),
    entityId: z.string(),
    payload: z.record(z.string(), z.unknown()),
    baseRevision: z.number().int().nullable().optional(),
    clientUpdatedAt: z.iso.datetime().optional(),
    deviceId: z.string().optional(),
  }),
  z.object({
    entity: z.literal('asset'),
    operation: z.enum(['upsert', 'delete']),
    entityId: z.string(),
    payload: z.record(z.string(), z.unknown()),
  }),
]);

export async function POST(request: Request) {
  const auth = await requireSupabaseUser();
  if (!auth) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'invalid_mutation' }, { status: 400 });

  const mutation = parsed.data;
  if (mutation.entity === 'course') {
    if (mutation.operation === 'delete') {
      const cloudId = stringValue(mutation.payload.cloudId);
      if (cloudId) await auth.supabase.from('course').delete().eq('id', cloudId);
      return Response.json({ outcome: 'deleted' });
    }
    const result = await auth.supabase
      .from('course')
      .upsert(
        {
          owner: auth.user.id,
          local_id: stringValue(mutation.payload.localId),
          subject: stringValue(mutation.payload.subject),
          curriculum: stringValue(mutation.payload.curriculum),
          name: stringValue(mutation.payload.name),
          pack_id: nullableString(mutation.payload.packId),
          color: nullableString(mutation.payload.color),
          ordinal: numberValue(mutation.payload.ordinal),
        },
        { onConflict: 'owner,local_id' },
      )
      .select()
      .single();
    if (result.error) return Response.json({ error: 'push_failed' }, { status: 409 });
    return Response.json({ outcome: 'applied', row: result.data });
  }

  if (mutation.entity === 'unit') {
    if (mutation.operation === 'delete') {
      const cloudId = stringValue(mutation.payload.cloudId);
      if (cloudId) await auth.supabase.from('unit').delete().eq('id', cloudId);
      return Response.json({ outcome: 'deleted' });
    }
    const result = await auth.supabase
      .from('unit')
      .upsert(
        {
          course: stringValue(mutation.payload.course),
          local_id: stringValue(mutation.payload.localId),
          name: stringValue(mutation.payload.name),
          ordinal: numberValue(mutation.payload.ordinal),
        },
        { onConflict: 'course,local_id' },
      )
      .select()
      .single();
    if (result.error) return Response.json({ error: 'push_failed' }, { status: 409 });
    return Response.json({ outcome: 'applied', row: result.data });
  }

  if (mutation.entity === 'note') {
    if (mutation.operation === 'delete') {
      const cloudId = nullableString(mutation.payload.cloudId);
      const localId = nullableString(mutation.payload.localId);
      let query = auth.supabase.from('note').delete();
      query = cloudId ? query.eq('id', cloudId) : query.eq('local_id', localId ?? '');
      const result = await query;
      if (result.error) return Response.json({ error: 'push_failed' }, { status: 409 });
      const thumbnailPath = nullableString(mutation.payload.thumbnailPath);
      if (thumbnailPath) await auth.supabase.storage.from('note-assets').remove([thumbnailPath]);
      return Response.json({ outcome: 'deleted' });
    }

    const result = await auth.supabase.rpc('sync_note', {
      p_local_id: stringValue(mutation.payload.localId),
      p_base_revision: mutation.baseRevision ?? null,
      p_client_updated_at: mutation.clientUpdatedAt ?? new Date().toISOString(),
      p_device_id: mutation.deviceId ?? 'unknown',
      p_payload: mutation.payload,
    });
    if (result.error) return Response.json({ error: 'push_failed' }, { status: 409 });
    return Response.json(result.data);
  }

  return Response.json({ error: 'asset_uses_upload_endpoint' }, { status: 400 });
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

function numberValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}
