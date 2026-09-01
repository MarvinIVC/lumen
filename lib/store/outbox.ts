import { getDb } from './db';
import type { OutboxEntry, SyncEntity, SyncOperation } from './types';

/** One pending mutation per local entity. Typing twenty characters updates the same row rather
 * than producing twenty network calls; delete replaces an earlier upsert. */
export async function queueMutation(
  entity: SyncEntity,
  entityId: string,
  operation: SyncOperation = 'upsert',
  payload?: unknown,
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const id = `${entity}:${entityId}`;
  const previous = await db.get('outbox', id);
  await db.put('outbox', {
    id,
    entity,
    entityId,
    operation,
    createdAt: previous?.createdAt ?? Date.now(),
    attempts: previous?.attempts ?? 0,
    ...(payload === undefined ? {} : { payload }),
  });
}

export async function listOutbox(): Promise<OutboxEntry[]> {
  const db = await getDb();
  if (!db) return [];
  return db.getAllFromIndex('outbox', 'by-createdAt');
}

export async function acknowledgeMutation(id: string): Promise<void> {
  const db = await getDb();
  await db?.delete('outbox', id);
}

export async function markMutationAttempt(entry: OutboxEntry): Promise<void> {
  const db = await getDb();
  await db?.put('outbox', { ...entry, attempts: entry.attempts + 1 });
}
