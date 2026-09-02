/**
 * notion-search — where should this course's pages go? (06 §3)
 *
 * A public Notion integration can only see what the student explicitly shared with it during
 * consent, so this is a short list rather than a search of their workspace. It exists because the
 * alternative is asking a student to paste a database id out of a URL.
 *
 * The token never leaves this side; the client gets titles and ids.
 */
import { resolveCaller } from '../_shared/auth.ts';
import { error, json, serve } from '../_shared/response.ts';
import { decryptToken, loadIntegration, markRevoked } from '../_shared/integrations.ts';

const API = 'https://api.notion.com/v1';
const VERSION = '2022-06-28';

interface NotionResult {
  id: string;
  object: string;
  title?: { plain_text?: string }[];
  properties?: Record<string, { type?: string; title?: { plain_text?: string }[] }>;
  parent?: { type?: string };
}

/** A page's title lives in a `title` property; a database's is a top-level `title` array. */
function titleOf(result: NotionResult): string {
  if (result.title?.length) return result.title.map((part) => part.plain_text ?? '').join('');
  for (const property of Object.values(result.properties ?? {})) {
    if (property.type === 'title' && property.title?.length) {
      return property.title.map((part) => part.plain_text ?? '').join('');
    }
  }
  return 'Untitled';
}

serve(async (request) => {
  const { caller } = await resolveCaller(request, {});
  if (!caller.userId) return error(request, 'signed_out', 'Connect Notion first.', 401);

  const row = await loadIntegration(caller.userId, 'notion');
  const token = row && !row.revoked ? await decryptToken(row) : null;
  if (!token) return error(request, 'reauth', 'Reconnect Notion to choose a destination.', 409);

  try {
    const response = await fetch(`${API}/search`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        'Notion-Version': VERSION,
      },
      body: JSON.stringify({
        // Most recently touched first: the page a student just shared with the integration is the
        // one they mean, and it is almost always the one they were last looking at.
        sort: { direction: 'descending', timestamp: 'last_edited_time' },
        page_size: 25,
      }),
    });

    if (response.status === 401 || response.status === 403) {
      await markRevoked(caller.userId, 'notion');
      return error(request, 'reauth', 'Notion withdrew our access. Reconnect to continue.', 409);
    }
    if (!response.ok) return error(request, 'search_failed', 'Notion did not answer.', 502);

    const body = (await response.json()) as { results?: NotionResult[] };
    const targets = (body.results ?? [])
      .filter((result) => result.object === 'database' || result.object === 'page')
      .map((result) => ({
        id: result.id,
        type: result.object === 'database' ? ('database_id' as const) : ('page_id' as const),
        title: titleOf(result),
      }));

    return json(request, { targets, workspace: row!.account_label ?? null });
  } catch {
    return error(request, 'search_failed', 'Notion did not answer.', 502);
  }
});
