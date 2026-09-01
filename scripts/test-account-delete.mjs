#!/usr/bin/env node

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
const admin = createClient(url, keys.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const email = `delete-${crypto.randomUUID().slice(0, 8)}@example.test`;
const password = `Delete-${crypto.randomUUID()}!`;
const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
if (created.error || !created.data.user) throw created.error ?? new Error('Could not create user');
const userId = created.data.user.id;
const client = createClient(url, keys.ANON_KEY, { auth: { persistSession: false } });
const signedIn = await client.auth.signInWithPassword({ email, password });
if (signedIn.error || !signedIn.data.session)
  throw signedIn.error ?? new Error('Could not sign in');

try {
  const course = await client
    .from('course')
    .insert({
      owner: userId,
      local_id: 'delete-course',
      subject: 'History',
      curriculum: 'GENERAL',
      name: 'History',
    })
    .select()
    .single();
  if (course.error) throw course.error;
  const note = await client
    .from('note')
    .insert({ owner: userId, course: course.data.id, local_id: 'delete-note', title: 'Delete me' })
    .select()
    .single();
  if (note.error) throw note.error;
  const path = `${userId}/${note.data.id}/thumbnail.svg`;
  const uploaded = await client.storage
    .from('note-assets')
    .upload(path, new Blob(['<svg/>'], { type: 'image/svg+xml' }));
  if (uploaded.error) throw uploaded.error;

  const response = await fetch(`${url}/functions/v1/delete-account`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${signedIn.data.session.access_token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ email }),
  });
  if (!response.ok)
    throw new Error(`delete-account returned ${response.status}: ${await response.text()}`);

  const authCheck = await admin.auth.admin.getUserById(userId);
  if (authCheck.data.user) throw new Error('Auth user survived account deletion');
  const rows = await admin.from('profile').select('id').eq('id', userId);
  if (rows.data?.length) throw new Error('Profile rows survived account deletion');
  const object = await admin.storage.from('note-assets').download(path);
  if (!object.error) throw new Error('Storage object survived account deletion');
  console.log('Account deletion passed: auth, relational rows and Storage objects were removed.');
} finally {
  await admin.auth.admin.deleteUser(userId).catch(() => undefined);
}
