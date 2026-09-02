#!/usr/bin/env node

/**
 * Drives PostgREST and Storage as two real authenticated users. A policy that
 * merely looks owner-scoped in SQL is not evidence until user B asks for user
 * A's exact ids and gets nothing back.
 */
import { execFileSync } from 'node:child_process';

import { createClient } from '@supabase/supabase-js';

const url = 'http://127.0.0.1:54321';

function localKeys() {
  const output = execFileSync('pnpm', ['exec', 'supabase', 'status', '-o', 'env'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const values = Object.fromEntries(
    output
      .split('\n')
      .map((line) => line.match(/^([A-Z_]+)="(.*)"$/))
      .filter(Boolean)
      .map((match) => [match[1], match[2]]),
  );
  if (!values.ANON_KEY || !values.SERVICE_ROLE_KEY) {
    throw new Error('Local Supabase keys were not reported. Run `pnpm db:start` first.');
  }
  return values;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const keys = localKeys();
const admin = createClient(url, keys.SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const anon = createClient(url, keys.ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const nonce = crypto.randomUUID().slice(0, 8);
const password = `Rls-${crypto.randomUUID()}!`;

async function makeUser(label) {
  const email = `rls-${label}-${nonce}@example.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error(`Could not create ${label}`);

  const client = createClient(url, keys.ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signedIn = await client.auth.signInWithPassword({ email, password });
  if (signedIn.error) throw signedIn.error;
  return { id: data.user.id, client };
}

const createdUsers = [];
try {
  const a = await makeUser('a');
  const b = await makeUser('b');
  createdUsers.push(a.id, b.id);

  const courseResult = await a.client
    .from('course')
    .insert({
      owner: a.id,
      local_id: `course-${nonce}`,
      subject: 'Chemistry',
      curriculum: 'AP',
      name: 'AP Chemistry',
    })
    .select()
    .single();
  if (courseResult.error) throw courseResult.error;
  const course = courseResult.data;

  const unitResult = await a.client
    .from('unit')
    .insert({ course: course.id, local_id: `unit-${nonce}`, name: 'Atomic structure' })
    .select()
    .single();
  if (unitResult.error) throw unitResult.error;
  const unit = unitResult.data;

  const noteResult = await a.client
    .from('note')
    .insert({
      owner: a.id,
      course: course.id,
      unit: unit.id,
      local_id: `note-${nonce}`,
      title: 'User A only',
      status: 'ready',
      doc: { sections: [] },
    })
    .select()
    .single();
  if (noteResult.error) throw noteResult.error;
  const note = noteResult.data;

  const childResult = await a.client
    .from('note_asset')
    .insert({ note: note.id, storage_path: `${a.id}/${note.id}/thumb.svg`, kind: 'thumbnail' })
    .select()
    .single();
  if (childResult.error) throw childResult.error;

  // The other two transitively-owned tables, and the one that is owned directly.
  const cardResult = await a.client
    .from('flashcard')
    .insert({ note: note.id, front: 'What is a mole?', back: '6.022e23' })
    .select()
    .single();
  if (cardResult.error) throw cardResult.error;
  const quizResult = await a.client
    .from('quiz_item')
    .insert({ note: note.id, kind: 'short-answer', prompt: 'Define a mole.', answer: '6.022e23' })
    .select()
    .single();
  if (quizResult.error) throw quizResult.error;
  // An integration row is created by the OAuth callback with the service role, never by a
  // browser — phase-07's `0004` revoked `insert` from `authenticated` outright, so this seeds it
  // the way the product does and then asserts the browser's side of the boundary below.
  const integrationResult = await admin
    .from('integration')
    .insert({ owner: a.id, kind: 'notion', token_ciphertext: 'sealed', meta: {} })
    .select()
    .single();
  if (integrationResult.error) throw integrationResult.error;

  const forgedIntegration = await a.client
    .from('integration')
    .insert({ owner: a.id, kind: 'drive', token_ciphertext: 'forged' });
  assert(
    Boolean(forgedIntegration.error),
    'An authenticated browser inserted an integration row; only the OAuth callback may',
  );

  // Phase-06 #8, applied to the second secret this product holds: the owner can see *that* a
  // workspace is connected, and cannot read the token back out.
  const ownStatus = await a.client.from('integration').select('kind, meta').eq('owner', a.id);
  assert(!ownStatus.error, "User A could not read their own integration's status");
  assert(ownStatus.data?.length === 1, 'User A did not see their own integration');
  const ownToken = await a.client.from('integration').select('token_ciphertext').eq('owner', a.id);
  assert(Boolean(ownToken.error), 'User A read their own integration token back out');

  const otherStatus = await b.client
    .from('integration')
    .select('kind, meta')
    .eq('id', integrationResult.data.id);
  assert(!otherStatus.error, "User B's integration read errored instead of returning no rows");
  assert(otherStatus.data?.length === 0, "User B read user A's integration row");

  // Even the columns a browser may read are refused wholesale, because `*` includes the token.
  const otherEverything = await b.client.from('integration').select('*');
  assert(Boolean(otherEverything.error), 'select(*) on integration is not denied to a browser');

  for (const [table, id] of [
    ['course', course.id],
    ['unit', unit.id],
    ['note', note.id],
    ['note_asset', childResult.data.id],
    ['flashcard', cardResult.data.id],
    ['quiz_item', quizResult.data.id],
    // `integration` is deliberately not in this loop: `select('*')` on it is denied outright for
    // `authenticated`, because there is no grant on the token columns at all. That is a stronger
    // answer than "no rows", and it is checked on the readable columns just below.
  ]) {
    const result = await b.client.from(table).select('*').eq('id', id);
    assert(!result.error, `User B's ${table} read errored instead of returning no rows`);
    assert(result.data?.length === 0, `User B read user A's ${table} row`);
  }

  const stolenInsert = await b.client.from('note').insert({
    owner: a.id,
    local_id: `stolen-${nonce}`,
    title: 'Not mine',
    status: 'draft',
  });
  assert(Boolean(stolenInsert.error), 'User B inserted a note owned by user A');

  const stolenUpdate = await b.client
    .from('note')
    .update({ title: 'Changed by B' })
    .eq('id', note.id)
    .select();
  assert(!stolenUpdate.error, 'A hidden update should affect zero rows, not expose policy details');
  assert(stolenUpdate.data?.length === 0, "User B updated user A's note");

  const stolenDelete = await b.client.from('note').delete().eq('id', note.id).select();
  assert(!stolenDelete.error, 'A hidden delete should affect zero rows, not expose policy details');
  assert(stolenDelete.data?.length === 0, "User B deleted user A's note");

  // `select('*')` on `profile` errors for everyone, owner included, because `*` expands to
  // columns the grant withholds — so the isolation check has to name the readable ones.
  const foreignProfile = await b.client
    .from('profile')
    .select('id,display_name,locale,prefs')
    .eq('id', a.id);
  assert(!foreignProfile.error, "User B's profile read errored instead of returning no rows");
  assert(foreignProfile.data?.length === 0, "User B read user A's profile row");

  // Phase-04 promised the sealed key cannot be read back out. That is a column grant, not a
  // policy: the row is user A's own, and they must still not be able to select the ciphertext.
  const ownBoyk = await a.client.from('profile').select('byok').eq('id', a.id);
  assert(Boolean(ownBoyk.error), 'The BYOK ciphertext was readable by its own owner');
  const writeByok = await a.client.from('profile').update({ byok: 'forged' }).eq('id', a.id);
  assert(Boolean(writeByok.error), 'The BYOK ciphertext was writable from the browser');

  const configRead = await b.client.from('app_config').select('*');
  assert(
    Boolean(configRead.error) || configRead.data?.length === 0,
    'app_config was client-readable',
  );

  const shareId = `rls-${nonce}`;
  const shareInsert = await a.client.from('share').insert({
    id: shareId,
    note: note.id,
    owner: a.id,
  });
  if (shareInsert.error) throw shareInsert.error;
  // Phase-07 closed the share table to `anon` entirely. `0003` had left a policy letting anyone
  // holding a link select the row — which carries `note` and `owner`, so one link disclosed the
  // owner's user id and two could be correlated to the same person. The public surface is now the
  // `shared_note()` function and nothing else; `pnpm test:share` drives it end to end.
  const publicShare = await anon.from('share').select('id').eq('id', shareId);
  assert(
    Boolean(publicShare.error) || publicShare.data?.length === 0,
    'The share table is readable by a stranger; it carries the owner id',
  );
  const publicNote = await anon.from('note').select('id').eq('id', note.id);
  assert(
    Boolean(publicNote.error) || publicNote.data?.length === 0,
    'A public share made its note enumerable',
  );
  const throughFunction = await anon.rpc('shared_note', { p_share_id: shareId });
  assert(!throughFunction.error, 'The share function refused a stranger');
  assert(throughFunction.data?.ok === true, 'A live share was not readable through shared_note()');
  assert(
    throughFunction.data?.owner === undefined && throughFunction.data?.note === undefined,
    'shared_note() leaked an owner or a note id',
  );

  const path = `${a.id}/${note.id}/thumb.svg`;
  const svg = new Blob(['<svg xmlns="http://www.w3.org/2000/svg"/>'], {
    type: 'image/svg+xml',
  });
  const upload = await a.client.storage.from('note-assets').upload(path, svg);
  if (upload.error) throw upload.error;
  const foreignDownload = await b.client.storage.from('note-assets').download(path);
  assert(Boolean(foreignDownload.error), "User B downloaded user A's Storage object");
  const foreignUpload = await b.client.storage
    .from('note-assets')
    .upload(path, svg, { upsert: true });
  assert(Boolean(foreignUpload.error), "User B overwrote user A's Storage object");
  const ownerDownload = await a.client.storage.from('note-assets').download(path);
  assert(!ownerDownload.error, 'User A could not read their own Storage object');
  await a.client.storage.from('note-assets').remove([path]);

  console.log('RLS passed: user B cannot read or mutate user A rows or Storage objects.');
} finally {
  for (const id of createdUsers) await admin.auth.admin.deleteUser(id);
}
