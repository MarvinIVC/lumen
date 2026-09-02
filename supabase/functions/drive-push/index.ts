/**
 * drive-push — the Word export, into the student's Drive (06 §3).
 *
 * The browser builds the `.docx` and posts the bytes; this function refreshes the token and
 * uploads. It does not render anything, which is the same split the Word export already uses —
 * `docx` runs in a Web Worker on the client and has no business in a Deno function.
 *
 * **The folder is one Lumen created, and that is a consequence of the scope rather than a
 * preference.** `drive.file` grants access only to files the app itself created, so Lumen cannot
 * list — or even see — a student's existing folders. Reaching arbitrary folders means the Google
 * Picker, which is another script, another API key and more client bytes than the budget wants;
 * so v1 makes "Lumen" and a subfolder per course, remembers them in `integration.meta.folders`,
 * and the Picker is the v1.1 path to anywhere else.
 */
import { resolveCaller } from '../_shared/auth.ts';
import { error, json, serve } from '../_shared/response.ts';
import { decryptToken, loadIntegration, markRevoked, saveMeta } from '../_shared/integrations.ts';
import { decryptSecret, encryptSecret } from '../_shared/crypto.ts';
import { patch } from '../_shared/db.ts';

const FILES = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const FOLDER = 'application/vnd.google-apps.folder';

class Revoked extends Error {}

/**
 * A usable access token, refreshed if the stored one has expired.
 *
 * Google's access tokens last an hour, so for any student who connected more than an hour ago this
 * is the path every push takes — the unrefreshed one is the exception, not the rule.
 */
async function accessToken(
  owner: string,
  row: {
    token_ciphertext: string | null;
    refresh_ciphertext: string | null;
    expires_at: string | null;
  },
): Promise<string> {
  const stored = await decryptToken(row as never);
  const expires = row.expires_at ? Date.parse(row.expires_at) : 0;
  // A minute of slack, so a token that expires mid-upload is refreshed before it is used.
  if (stored && expires > Date.now() + 60_000) return stored;

  const refresh = row.refresh_ciphertext ? await decryptSecret(row.refresh_ciphertext) : null;
  if (!refresh) throw new Revoked();

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refresh,
      client_id: Deno.env.get('GOOGLE_DRIVE_OAUTH_CLIENT_ID') ?? '',
      client_secret: Deno.env.get('GOOGLE_DRIVE_OAUTH_CLIENT_SECRET') ?? '',
      grant_type: 'refresh_token',
    }),
  });
  if (!response.ok) throw new Revoked();

  const token = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!token.access_token) throw new Revoked();

  await patch('integration', `owner=eq.${owner}&kind=eq.drive`, {
    token_ciphertext: await encryptSecret(token.access_token),
    expires_at: new Date(Date.now() + (token.expires_in ?? 3600) * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  });
  return token.access_token;
}

async function drive(token: string, url: string, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(url, {
    ...init,
    headers: { authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
  });
  if (response.status === 401 || response.status === 403) throw new Revoked();
  return response;
}

/**
 * Finds or makes a folder, by name, under a parent.
 *
 * The lookup is scoped by `trashed = false` because a student who deletes the folder should get a
 * new one rather than an upload into the bin — where it would succeed, report success, and be
 * invisible.
 */
async function folder(token: string, name: string, parent?: string): Promise<string> {
  const clauses = [
    `name = '${name.replace(/'/g, "\\'")}'`,
    `mimeType = '${FOLDER}'`,
    'trashed = false',
    parent ? `'${parent}' in parents` : null,
  ].filter(Boolean);

  const found = await drive(
    token,
    `${FILES}?q=${encodeURIComponent(clauses.join(' and '))}&fields=files(id)&pageSize=1`,
  );
  if (found.ok) {
    const body = (await found.json()) as { files?: { id: string }[] };
    const existing = body.files?.[0]?.id;
    if (existing) return existing;
  }

  const created = await drive(token, FILES, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, mimeType: FOLDER, ...(parent ? { parents: [parent] } : {}) }),
  });
  if (!created.ok) throw new Error(`drive folder: ${created.status}`);
  return String(((await created.json()) as { id: string }).id);
}

serve(async (request) => {
  if (request.method !== 'POST') return error(request, 'method_not_allowed', 'POST only.', 405);

  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  const noteLocalId = form?.get('noteLocalId');
  const filename = String(form?.get('filename') ?? 'study-guide.docx');
  const course = String(form?.get('course') ?? '').trim();

  const { caller } = await resolveCaller(request, {});
  if (!caller.userId) return error(request, 'signed_out', 'Connect Drive first.', 401);
  if (!(file instanceof File) || typeof noteLocalId !== 'string') {
    return error(request, 'invalid_request', 'A document is required.', 400);
  }
  if (file.size > 20_000_000) {
    return error(request, 'too_large', 'That document is too large to upload.', 413);
  }

  const row = await loadIntegration(caller.userId, 'drive');
  if (!row || row.revoked) return error(request, 'reauth', 'Reconnect Drive to keep pushing.', 409);

  try {
    const token = await accessToken(caller.userId, row);
    const meta = (row.meta ?? {}) as { folders?: Record<string, string>; root?: string };
    const folders = meta.folders ?? {};

    const root = meta.root ?? (await folder(token, 'Lumen'));
    const key = course || 'Unsorted';
    const parent = folders[key] ?? (await folder(token, key, root));

    // Multipart: the metadata and the bytes in one request, which is what Drive wants for a file
    // that has both. `supportsAllDrives` so a school account with a shared drive works too.
    const boundary = `lumen${crypto.randomUUID().replace(/-/g, '')}`;
    const metadata = JSON.stringify({ name: filename, parents: [parent] });
    const head = `--${boundary}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\ncontent-type: ${DOCX}\r\n\r\n`;
    const tail = `\r\n--${boundary}--`;

    const bytes = new Uint8Array(await file.arrayBuffer());
    const body = new Blob([head, bytes, tail]);

    const uploaded = await drive(
      token,
      `${UPLOAD}?uploadType=multipart&supportsAllDrives=true&fields=id,webViewLink`,
      {
        method: 'POST',
        headers: { 'content-type': `multipart/related; boundary=${boundary}` },
        body,
      },
    );
    if (!uploaded.ok) throw new Error(`drive upload: ${uploaded.status}`);

    const created = (await uploaded.json()) as { id: string; webViewLink?: string };

    await saveMeta(caller.userId, 'drive', {
      ...meta,
      root,
      folders: { ...folders, [key]: parent },
    });

    return json(request, {
      ok: true,
      id: created.id,
      url: created.webViewLink ?? `https://drive.google.com/file/d/${created.id}/view`,
      folder: key,
    });
  } catch (thrown) {
    if (thrown instanceof Revoked) {
      await markRevoked(caller.userId, 'drive');
      return error(
        request,
        'reauth',
        'Google withdrew our access. Reconnect to keep pushing.',
        409,
      );
    }
    return error(
      request,
      'push_failed',
      'That upload did not finish. Your note is untouched.',
      502,
    );
  }
});
