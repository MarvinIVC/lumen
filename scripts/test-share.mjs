#!/usr/bin/env node

/**
 * The public share path, driven as a stranger with no session (06 §4).
 *
 * `0003` revoked every grant on `note` from `anon` and dropped the policy that
 * made a shared note readable, so the whole public surface is one security-definer
 * function. That is the sort of arrangement that can be true in SQL and false in
 * practice, so this asks for the note the way the share page does — and then asks
 * for it the ways a stranger would try instead.
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

let passed = 0;
function check(condition, message) {
  if (!condition) throw new Error(message);
  passed += 1;
  console.log(`  ✓ ${message}`);
}

const keys = localKeys();
const admin = createClient(url, keys.SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const stranger = createClient(url, keys.ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const nonce = crypto.randomUUID().slice(0, 8);
const password = `Share-${crypto.randomUUID()}!`;
const email = `share-${nonce}@example.test`;
const created = [];

try {
  const { data: made, error: madeError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (madeError || !made.user) throw madeError ?? new Error('could not create the owner');
  created.push(made.user.id);
  const owner = made.user.id;

  const client = createClient(url, keys.ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signedIn = await client.auth.signInWithPassword({ email, password });
  if (signedIn.error) throw signedIn.error;

  const { data: note, error: noteError } = await client
    .from('note')
    .insert({
      owner,
      local_id: `note-${nonce}`,
      title: 'Shared study guide',
      status: 'ready',
      subject: 'Chemistry',
      curriculum: 'AP',
      doc: { sections: [{ id: 's-1', title: 'The mole', level: 2, blocks: [] }] },
    })
    .select()
    .single();
  if (noteError) throw noteError;

  const shareId = `shr${nonce}`;
  const { error: shareError } = await client
    .from('share')
    .insert({ id: shareId, note: note.id, owner });
  if (shareError) throw shareError;

  console.log('\nA live link');
  const live = await stranger.rpc('shared_note', { p_share_id: shareId });
  check(!live.error, 'a stranger with no session can read a live share');
  check(live.data?.ok === true, 'the function reports the share as live');
  check(live.data?.title === 'Shared study guide', 'the title comes back');
  check(Array.isArray(live.data?.doc?.sections), 'the document comes back');
  check(
    live.data?.owner === undefined && live.data?.note === undefined,
    'no owner and no note id are exposed — 06 §4, no owner PII on the page',
  );

  console.log('\nWhat a stranger cannot do instead');
  const direct = await stranger.from('note').select('*').eq('id', note.id);
  check(
    Boolean(direct.error) || (direct.data ?? []).length === 0,
    'the note itself is unreadable through PostgREST',
  );
  const shareRow = await stranger.from('share').select('note, owner').eq('id', shareId);
  check(
    Boolean(shareRow.error) || (shareRow.data ?? []).length === 0,
    'the share row does not hand out the note id and the owner',
  );
  const missing = await stranger.rpc('shared_note', { p_share_id: 'shr-does-not-exist' });
  check(missing.data?.ok === false, 'an unknown id is refused');

  console.log('\nRevoke');
  await client.from('share').update({ revoked: true }).eq('id', shareId);
  const revoked = await stranger.rpc('shared_note', { p_share_id: shareId });
  check((revoked.data?.ok === true) === false, 'a revoked link stops reading immediately');
  check(
    revoked.data?.title === undefined,
    'a revoked link returns no title either — the same answer as an unknown one',
  );

  console.log('\nExpiry');
  await client
    .from('share')
    .update({ revoked: false, expires_at: new Date(Date.now() - 1000).toISOString() })
    .eq('id', shareId);
  const expired = await stranger.rpc('shared_note', { p_share_id: shareId });
  check(expired.data?.ok === false, 'an expired link stops reading immediately');

  await client.from('share').update({ expires_at: null }).eq('id', shareId);

  console.log('\nRate limiting');
  // Its own link, because the counter is per share per minute and the reads above have already
  // used some of this one's budget. Only a successful read is counted — a revoked or expired link
  // returns before the counter, so a stranger cannot exhaust a limit by hammering a dead link.
  const hotId = `hot${nonce}`;
  await client.from('share').insert({ id: hotId, note: note.id, owner });
  const first = await stranger.rpc('shared_note', { p_share_id: hotId, p_limit: 2 });
  const second = await stranger.rpc('shared_note', { p_share_id: hotId, p_limit: 2 });
  const third = await stranger.rpc('shared_note', { p_share_id: hotId, p_limit: 2 });
  check(first.data?.ok === true && second.data?.ok === true, 'reads within the limit are served');
  check(
    third.data?.ok === false && third.data?.throttled === true,
    'the read past the limit is throttled',
  );

  console.log('\nThe integration token stays out of the browser');
  const { error: tokenError } = await admin.from('integration').insert({
    owner,
    kind: 'notion',
    token_ciphertext: 'v1.secret.ciphertext',
    meta: { workspace: 'Test' },
  });
  if (tokenError) throw tokenError;
  const readBack = await client.from('integration').select('kind, meta').eq('owner', owner);
  check(!readBack.error, 'the owner can see which integrations are connected');
  const sneaky = await client.from('integration').select('token_ciphertext').eq('owner', owner);
  check(
    Boolean(sneaky.error),
    'the owner cannot read their own token back out — phase-06 #8, applied to the second secret',
  );

  console.log(`\n${passed} checks passed.`);
} finally {
  for (const id of created) await admin.auth.admin.deleteUser(id).catch(() => {});
}
