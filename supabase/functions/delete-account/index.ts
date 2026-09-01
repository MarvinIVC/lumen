/** Irreversible account deletion, kept behind an authenticated token and typed-email check. */
import { error, json, serve } from '../_shared/response.ts';

const baseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const headers = () => ({
  apikey: serviceKey,
  authorization: `Bearer ${serviceKey}`,
  'content-type': 'application/json',
});

serve(async (request) => {
  if (request.method !== 'POST') return error(request, 'method_not_allowed', 'POST only.', 405);
  const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  const userResponse = await fetch(`${baseUrl}/auth/v1/user`, {
    headers: { apikey: serviceKey, authorization: `Bearer ${bearer}` },
  });
  if (!userResponse.ok)
    return error(request, 'unauthorized', 'Sign in again before deleting your account.', 401);
  const user = (await userResponse.json()) as { id?: string; email?: string };
  const body = (await request.json().catch(() => null)) as { email?: string } | null;
  if (
    !user.id ||
    !user.email ||
    body?.email?.trim().toLocaleLowerCase() !== user.email.toLocaleLowerCase()
  ) {
    return error(request, 'email_mismatch', 'The email address did not match.', 400);
  }

  // Storage is not covered by database cascades. List and delete the user's private prefix first.
  const paths: string[] = [];
  const prefixes = [user.id];
  while (prefixes.length) {
    const prefix = prefixes.shift()!;
    const listed = await fetch(`${baseUrl}/storage/v1/object/list/note-assets`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ prefix, limit: 1000, offset: 0 }),
    });
    if (!listed.ok)
      return error(request, 'storage_failed', 'We could not remove your previews.', 500);
    const objects = (await listed.json()) as { id?: string | null; name?: string }[];
    for (const object of objects) {
      if (!object.name) continue;
      const path = `${prefix}/${object.name}`;
      if (object.id) paths.push(path);
      else prefixes.push(path);
    }
  }
  if (paths.length) {
    const removed = await fetch(`${baseUrl}/storage/v1/object/note-assets`, {
      method: 'DELETE',
      headers: headers(),
      body: JSON.stringify({ prefixes: paths }),
    });
    if (!removed.ok)
      return error(request, 'storage_failed', 'We could not remove your previews.', 500);
  }

  // Deleting auth.users cascades through profile and every owner/transitive table.
  const deleted = await fetch(`${baseUrl}/auth/v1/admin/users/${user.id}`, {
    method: 'DELETE',
    headers: headers(),
  });
  if (!deleted.ok) return error(request, 'delete_failed', 'We could not remove your account.', 500);
  return json(request, { ok: true });
});
