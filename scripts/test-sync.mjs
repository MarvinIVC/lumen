#!/usr/bin/env node

/** Exercises the compare-and-swap contract as two offline devices of one account. */
import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

const url = 'http://127.0.0.1:54321';
const output = execFileSync('pnpm', ['exec', 'supabase', 'status', '-o', 'env'], {
  encoding: 'utf8',
});
const keys = Object.fromEntries(
  output
    .split('\n')
    .map((line) => line.match(/^([A-Z_]+)="(.*)"$/))
    .filter(Boolean)
    .map((match) => [match[1], match[2]]),
);
if (!keys.ANON_KEY || !keys.SERVICE_ROLE_KEY) throw new Error('Run `pnpm db:start` first.');
const admin = createClient(url, keys.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const nonce = crypto.randomUUID().slice(0, 8);
const email = `sync-${nonce}@example.test`;
const password = `Sync-${crypto.randomUUID()}!`;
const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
if (created.error || !created.data.user)
  throw created.error ?? new Error('Could not create test user');
const client = createClient(url, keys.ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const signedIn = await client.auth.signInWithPassword({ email, password });
if (signedIn.error) throw signedIn.error;

function assert(value, message) {
  if (!value) throw new Error(message);
}
function payload(title, text) {
  return {
    title,
    language: 'en',
    mode: 'complete',
    status: 'ready',
    doc: { title, sections: [], marker: text },
    source: {},
    stats: {},
    searchText: text,
    createdAt: new Date().toISOString(),
  };
}
async function push(localId, revision, device, title, text, at = new Date().toISOString()) {
  const result = await client.rpc('sync_note', {
    p_local_id: localId,
    p_base_revision: revision,
    p_client_updated_at: at,
    p_device_id: device,
    p_payload: payload(title, text),
  });
  if (result.error) throw result.error;
  return result.data;
}

try {
  const localId = `note-${nonce}`;
  const first = await push(localId, null, 'device-a', 'Shared lesson', 'initial');
  assert(first.outcome === 'inserted' && first.revision === 1, 'First local note was not inserted');

  const replay = await push(
    localId,
    null,
    'device-a',
    'Older replay',
    'old',
    '2020-01-01T00:00:00.000Z',
  );
  assert(replay.outcome === 'cloud-wins', 'An older first-merge replay did not keep cloud');
  const deduped = await client.from('note').select('id').eq('local_id', localId);
  assert(deduped.data?.length === 1, 'A replay duplicated a localId');

  // Any writer other than `sync_note` still advances the revision, so it has to hand the new one
  // back or the next edit from that same device arrives stale. `/api/assets/thumbnail` is the only
  // such writer today, and this is what it costs to forget: a conflicted copy of the student's own
  // note, on one device, with nobody else involved.
  const beforeThumbnail = await client
    .from('note')
    .select('id,sync_revision')
    .eq('local_id', localId)
    .single();
  if (beforeThumbnail.error) throw beforeThumbnail.error;
  const thumbnailWrite = await client
    .from('note')
    .update({ thumbnail_path: `${created.data.user.id}/${beforeThumbnail.data.id}/thumbnail.svg` })
    .eq('id', beforeThumbnail.data.id)
    .select('sync_revision')
    .single();
  if (thumbnailWrite.error) throw thumbnailWrite.error;
  assert(
    thumbnailWrite.data.sync_revision === beforeThumbnail.data.sync_revision + 1,
    'A direct note write did not advance the revision, so the CAS contract is not what sync assumes',
  );
  const afterThumbnail = await push(
    localId,
    thumbnailWrite.data.sync_revision,
    'device-a',
    'Shared lesson',
    'after thumbnail',
  );
  assert(
    afterThumbnail.outcome === 'applied',
    'An edit carrying the revision the thumbnail write returned was not applied',
  );

  // Both devices pulled this revision before going offline.
  const shared = afterThumbnail.revision;
  const deviceA = await push(localId, shared, 'device-a', 'Device A lesson', 'from A');
  assert(
    deviceA.outcome === 'applied' && deviceA.revision === shared + 1,
    'Device A edit did not apply',
  );
  const deviceB = await push(localId, shared, 'device-b', 'Device B lesson', 'from B');
  assert(
    deviceB.outcome === 'conflict' && deviceB.conflictLocalId,
    'Stale device B edit was not preserved',
  );

  const versions = await client
    .from('note')
    .select('local_id,title,doc,sync_revision,conflict_of,conflict_status')
    .order('created_at');
  if (versions.error) throw versions.error;
  assert(versions.data.length === 2, 'A true conflict did not preserve both blobs');
  assert(
    versions.data.some((row) => row.doc?.marker === 'from A'),
    'Device A blob was lost',
  );
  const conflict = versions.data.find((row) => row.doc?.marker === 'from B');
  assert(
    conflict?.conflict_status === 'unresolved',
    'Conflicted copy was not surfaced as unresolved',
  );

  const resolved = await push(
    conflict.local_id,
    conflict.sync_revision,
    'device-b',
    'Device B lesson',
    'from B',
  );
  assert(resolved.outcome === 'applied', 'Conflict resolver could not keep the sibling');
  const after = await client
    .from('note')
    .select('conflict_status')
    .eq('local_id', conflict.local_id)
    .single();
  assert(after.data?.conflict_status === null, 'Conflict resolver left an unresolved flag');
  console.log(
    'Sync passed: localId merge is idempotent and offline conflicts preserve both blobs.',
  );
} finally {
  await admin.auth.admin.deleteUser(created.data.user.id);
}
