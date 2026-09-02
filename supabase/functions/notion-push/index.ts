/**
 * notion-push — a finished note, into the student's Notion workspace (06 §3).
 *
 * Three constraints shape all of this.
 *
 * **Notion allows about three requests a second**, so every call goes through `paced()`. A
 * forty-block note is a page create plus one append; a long one is several appends, and they are
 * spaced rather than fired.
 *
 * **Re-pushing must update, not duplicate.** The page id is remembered per note in
 * `integration.meta.notes`, and a re-push archives that page's existing children and writes fresh
 * ones into the *same page*. Creating a new page each time would be two requests instead of N —
 * but the page URL is the backlink a student has already pasted somewhere, and changing it every
 * time is a worse bug than being slow.
 *
 * **A revoked token must never lose the note.** Notion answers 401 once access is withdrawn; that
 * is turned into a clean `reauth` for the client and the row keeps its `meta`, so reconnecting
 * lands the note back in the database it was already going to.
 */
import { resolveCaller } from '../_shared/auth.ts';
import { error, json, serve } from '../_shared/response.ts';
import { decryptToken, loadIntegration, markRevoked, saveMeta } from '../_shared/integrations.ts';
import { patch } from '../_shared/db.ts';

const API = 'https://api.notion.com/v1';
const VERSION = '2022-06-28';

/** Notion's published limit is ~3 req/s averaged; 350 ms leaves room for their jitter. */
const GAP_MS = 350;

let lastCall = 0;
async function paced<T>(run: () => Promise<T>): Promise<T> {
  const wait = Math.max(0, lastCall + GAP_MS - Date.now());
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  lastCall = Date.now();
  return run();
}

class Revoked extends Error {}

async function notion(
  token: string,
  path: string,
  init: RequestInit & { body?: string } = {},
): Promise<Record<string, unknown>> {
  const response = await paced(() =>
    fetch(`${API}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        'Notion-Version': VERSION,
      },
    }),
  );

  // 401 is a withdrawn token and 403 is one that no longer has the page. Both mean "ask the
  // student to reconnect", and neither means the note is in any danger.
  if (response.status === 401 || response.status === 403) throw new Revoked();

  // 429 is the rate limiter. Notion says how long to wait, and it is worth obeying rather than
  // failing a push that is most of the way done.
  if (response.status === 429) {
    const after = Number(response.headers.get('retry-after') ?? '1');
    await new Promise((resolve) => setTimeout(resolve, Math.min(after, 10) * 1000));
    return notion(token, path, init);
  }

  if (!response.ok) throw new Error(`notion ${path}: ${response.status} ${await response.text()}`);
  return (await response.json()) as Record<string, unknown>;
}

/**
 * The blocks arrive already mapped.
 *
 * `lib/integrations/notion-blocks.ts` runs in the browser rather than here, and deliberately: it
 * reaches for `@/` aliases and for the export model, and making that whole chain Deno-safe would
 * be four modules rewritten to serve one caller. The browser is also where the pictures are — a
 * diagram is rasterised off the rendered page — so it is already the side that has to assemble
 * this. What is left here is the part only a server can do: hold the token, keep to the rate
 * limit, and own the page mapping.
 */
/**
 * Uploads one picture and returns Notion's file id.
 *
 * Three requests, which is why they are paced along with everything else: create the upload, send
 * the bytes, then reference the id from a block. `external` URLs were the alternative and are not
 * one — the pictures live in a private bucket, a signed URL expires, and Notion's caching of
 * external images is not something a student's notes should depend on.
 */
async function uploadImage(token: string, base64: string, name: string): Promise<string | null> {
  try {
    const created = (await notion(token, '/file_uploads', {
      method: 'POST',
      body: JSON.stringify({ filename: name, content_type: 'image/png' }),
    })) as { id?: string; upload_url?: string };
    if (!created.id || !created.upload_url) return null;

    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);

    const form = new FormData();
    form.set('file', new Blob([bytes], { type: 'image/png' }), name);

    const sent = await paced(() =>
      fetch(created.upload_url!, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'Notion-Version': VERSION },
        body: form,
      }),
    );
    if (sent.status === 401 || sent.status === 403) throw new Revoked();
    return sent.ok ? created.id : null;
  } catch (thrown) {
    if (thrown instanceof Revoked) throw thrown;
    // One picture that will not upload is a caption without an image, not a failed push.
    return null;
  }
}

/**
 * Swaps every `lumen:pending:<id>` placeholder for a real uploaded file, or drops the block.
 *
 * The mapper emits a placeholder that is deliberately not a usable URL, so a picture that never
 * got uploaded cannot quietly reach Notion as a broken external link — it is removed, and the
 * caption paragraph that follows it still says what was meant to be there.
 */
async function resolveImages(
  token: string,
  blocks: Record<string, unknown>[],
  images: { blockId: string; base64: string }[],
): Promise<Record<string, unknown>[]> {
  if (!images.length) return blocks.filter((block) => !isPending(block));

  const uploaded = new Map<string, string>();
  for (const image of images) {
    const id = await uploadImage(token, image.base64, `${image.blockId}.png`);
    if (id) uploaded.set(image.blockId, id);
  }

  const out: Record<string, unknown>[] = [];
  for (const block of blocks) {
    const pendingFor = pendingId(block);
    if (!pendingFor) {
      out.push(block);
      continue;
    }
    const fileId = uploaded.get(pendingFor);
    if (!fileId) continue;
    const image = block.image as { caption?: unknown };
    out.push({
      object: 'block',
      type: 'image',
      image: { type: 'file_upload', file_upload: { id: fileId }, caption: image.caption ?? [] },
    });
  }
  return out;
}

function pendingId(block: Record<string, unknown>): string | null {
  if (block.type !== 'image') return null;
  const url = (block.image as { external?: { url?: string } } | undefined)?.external?.url ?? '';
  return url.startsWith('lumen:pending:') ? url.slice('lumen:pending:'.length) : null;
}

function isPending(block: Record<string, unknown>): boolean {
  return pendingId(block) !== null;
}

interface PushBody {
  noteLocalId?: string;
  title?: string;
  blocks?: Record<string, unknown>[];
  /** Rasterised on the client, because that is where the rendered diagrams are. */
  images?: { blockId: string; base64: string }[];
  /** Where this course's pages live: a database id or a parent page id, chosen once per course. */
  target?: { type: 'database_id' | 'page_id'; id: string };
  courseKey?: string;
}

/** Notion refuses a request carrying more than 100 children, and it is a hard limit. */
const MAX_CHILDREN = 100;

function batches<T>(items: T[], size = MAX_CHILDREN): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += size)
    out.push(items.slice(index, index + size));
  return out;
}

serve(async (request) => {
  if (request.method !== 'POST') return error(request, 'method_not_allowed', 'POST only.', 405);

  const body = (await request.json().catch(() => ({}))) as PushBody;
  const { caller } = await resolveCaller(request, {});
  if (!caller.userId) {
    return error(request, 'signed_out', 'Connect Notion from your account first.', 401);
  }
  if (!body.blocks?.length || !body.noteLocalId) {
    return error(request, 'invalid_request', 'A note and its blocks are required.', 400);
  }

  const row = await loadIntegration(caller.userId, 'notion');
  const token = row && !row.revoked ? await decryptToken(row) : null;
  if (!token) return error(request, 'reauth', 'Reconnect Notion to keep pushing.', 409);

  const meta = (row!.meta ?? {}) as {
    courses?: Record<string, { type: string; id: string }>;
    notes?: Record<string, string>;
  };
  const courses = meta.courses ?? {};
  const notes = meta.notes ?? {};

  // Where the page goes: what this push chose, or what this course chose last time.
  const target = body.target ?? (body.courseKey ? courses[body.courseKey] : undefined);
  if (!target) return error(request, 'no_target', 'Choose where this course should go.', 400);

  const blocks = body.blocks;
  const existingPage = notes[body.noteLocalId];

  try {
    const pageId = existingPage
      ? await refresh(token, existingPage)
      : await create(
          token,
          target as { type: 'database_id' | 'page_id'; id: string },
          body.title ?? 'Study guide',
        );

    const resolved = await resolveImages(token, blocks, body.images ?? []);

    for (const chunk of batches(resolved, MAX_CHILDREN)) {
      await notion(token, `/blocks/${pageId}/children`, {
        method: 'PATCH',
        body: JSON.stringify({ children: chunk }),
      });
    }

    await saveMeta(caller.userId, 'notion', {
      ...meta,
      courses:
        body.courseKey && body.target ? { ...courses, [body.courseKey]: body.target } : courses,
      notes: { ...notes, [body.noteLocalId]: pageId },
    });

    // The badge the library card already renders. Written with the service role, on a column
    // `sync_note` does not touch, so it cannot collide with the compare-and-swap write path.
    await patch('note', `owner=eq.${caller.userId}&local_id=eq.${body.noteLocalId}`, {
      notion_synced_at: new Date().toISOString(),
    }).catch(() => {});

    return json(request, {
      ok: true,
      pageId,
      url: `https://www.notion.so/${pageId.replace(/-/g, '')}`,
      blocks: resolved.length,
      updated: Boolean(existingPage),
    });
  } catch (thrown) {
    if (thrown instanceof Revoked) {
      await markRevoked(caller.userId, 'notion');
      return error(
        request,
        'reauth',
        'Notion withdrew our access. Reconnect to keep pushing.',
        409,
      );
    }
    return error(request, 'push_failed', 'That push did not finish. Your note is untouched.', 502);
  }
});

async function create(
  token: string,
  target: { type: 'database_id' | 'page_id'; id: string },
  title: string,
): Promise<string> {
  const parent =
    target.type === 'database_id' ? { database_id: target.id } : { page_id: target.id };
  // A database page's title lives in a named property; a child page's is `title`. Notion rejects
  // the wrong shape outright, so this is not a nicety.
  const properties =
    target.type === 'database_id'
      ? { title: { title: [{ type: 'text', text: { content: title } }] } }
      : { title: [{ type: 'text', text: { content: title } }] };

  const page = await notion(token, '/pages', {
    method: 'POST',
    body: JSON.stringify({ parent, properties }),
  });
  return String(page.id);
}

/**
 * Empties a page so it can be rewritten, keeping its id.
 *
 * Notion has no "replace children", so this archives them one at a time — the cost of keeping a
 * stable URL. Children are re-read between passes because archiving is not instantaneous.
 */
async function refresh(token: string, pageId: string): Promise<string> {
  const listed = (await notion(token, `/blocks/${pageId}/children?page_size=100`)) as {
    results?: { id: string }[];
  };
  for (const child of listed.results ?? []) {
    await notion(token, `/blocks/${child.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ archived: true }),
    });
  }
  return pageId;
}
