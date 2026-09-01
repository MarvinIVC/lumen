import { emptyDoc } from '@/lib/ingest';

import { getDb } from './db';
import { listNotes, loadNote, saveNote, toStoredDoc } from './drafts';
import { flattenDocument, placeAllNotes, saveCourse, saveUnit } from './library';
import { acknowledgeMutation, listOutbox, markMutationAttempt, queueMutation } from './outbox';
import { snapshot } from './versions';
import type { EnhanceOptions, NoteContext, NoteDocument } from '@/lib/ai/schema';
import type { LocalCourse, LocalNote, LocalUnit, OutboxEntry, SyncMeta } from './types';

const DEFAULT_CONTEXT: NoteContext = {
  subject: '',
  curriculum: 'UNKNOWN',
  course: '',
  unit: null,
  topic: null,
  language: 'en',
};
const DEFAULT_OPTIONS: EnhanceOptions = {
  mode: 'complete',
  depth: 'match',
  visuals: 'auto',
  voice: 'keep-mine',
};

type CloudRow = Record<string, unknown>;
interface PullResponse {
  courses: CloudRow[];
  units: CloudRow[];
  notes: CloudRow[];
  /** Every note id the account owns, changed or not — the only way to see a remote deletion. */
  noteIds?: string[];
  pulledAt: string;
}

interface PushResponse {
  outcome: 'inserted' | 'applied' | 'deleted' | 'cloud-wins' | 'conflict';
  id?: string;
  revision?: number;
  updatedAt?: string;
  row?: CloudRow;
}

let draining: Promise<void> | null = null;

export async function syncMeta(ownerId: string): Promise<SyncMeta | null> {
  const db = await getDb();
  if (!db) return null;
  const current = await db.get('syncMeta', 'state');
  const next: SyncMeta = current
    ? { ...current, ownerId, ...(current.ownerId === ownerId ? {} : { lastPulledAt: null }) }
    : {
        id: 'state',
        deviceId: crypto.randomUUID(),
        ownerId,
        lastPulledAt: null,
      };
  await db.put('syncMeta', next);
  return next;
}

export async function mergeAndStart(ownerId: string): Promise<void> {
  await syncMeta(ownerId);
  await placeAllNotes();
  await drainOutbox(ownerId);
  await pullCloud(ownerId);
}

export async function drainOutbox(ownerId: string): Promise<void> {
  if (draining) return draining;
  draining = drain(ownerId).finally(() => {
    draining = null;
  });
  return draining;
}

async function drain(ownerId: string): Promise<void> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
  const meta = await syncMeta(ownerId);
  if (!meta) return;

  const priority = { course: 0, unit: 1, note: 2, asset: 3 } as const;
  const entries = (await listOutbox()).sort(
    (a, b) => priority[a.entity] - priority[b.entity] || a.createdAt - b.createdAt,
  );
  for (const entry of entries) {
    try {
      const pushed = await pushEntry(entry, meta.deviceId);
      if (!pushed) continue;
      await acknowledgeMutation(entry.id);
    } catch {
      await markMutationAttempt(entry);
      break;
    }
  }
}

async function pushEntry(entry: OutboxEntry, deviceId: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  if (entry.operation === 'delete') {
    const result = await postMutation({
      entity: entry.entity,
      entityId: entry.entityId,
      operation: 'delete',
      payload: isRecord(entry.payload) ? entry.payload : {},
    });
    return result.outcome === 'deleted';
  }

  if (entry.entity === 'course') {
    const course = await db.get('courses', entry.entityId);
    if (!course) return true;
    const result = await postMutation({
      entity: 'course',
      entityId: course.id,
      operation: 'upsert',
      payload: coursePayload(course),
    });
    const row = result.row;
    const cloudId = string(row?.id);
    if (!cloudId) throw new Error('course push returned no id');
    await saveCourse({ ...course, cloudId }, false);
    return true;
  }

  if (entry.entity === 'unit') {
    const unit = await db.get('units', entry.entityId);
    if (!unit) return true;
    const course = await db.get('courses', unit.courseId);
    if (!course?.cloudId) {
      if (course) await queueMutation('course', course.id);
      return false;
    }
    const result = await postMutation({
      entity: 'unit',
      entityId: unit.id,
      operation: 'upsert',
      payload: unitPayload(unit, course.cloudId),
    });
    const cloudId = string(result.row?.id);
    if (!cloudId) throw new Error('unit push returned no id');
    await saveUnit({ ...unit, cloudId }, false);
    return true;
  }

  if (entry.entity === 'asset') {
    const asset = await db.get('assets', entry.entityId);
    if (!asset) return true;
    if (asset.kind !== 'note-thumbnail' || !asset.noteId) return true;
    const note = await loadNote(asset.noteId);
    if (!note?.cloudId) {
      if (note) await queueMutation('note', note.id);
      return false;
    }
    const form = new FormData();
    form.set('localId', note.localId);
    form.set('file', new File([asset.bytes], 'thumbnail.svg', { type: asset.mime }));
    const uploaded = await fetch('/api/assets/thumbnail', { method: 'POST', body: form });
    if (!uploaded.ok) throw new Error('thumbnail push failed');
    const result = (await uploaded.json()) as {
      path?: string;
      revision?: number;
      updatedAt?: string;
    };
    // The upload wrote `thumbnail_path` itself, so there is nothing left to push — but it also
    // moved the revision, and keeping the old one would make this device's next edit arrive stale
    // and come back as a conflicted copy of the student's own note.
    await saveNote(
      {
        ...note,
        thumbnailPath: result.path ?? note.thumbnailPath,
        cloudRevision: result.revision ?? note.cloudRevision,
        cloudUpdatedAt: result.updatedAt ?? note.cloudUpdatedAt,
      },
      { queue: false, preserveUpdatedAt: true, thumbnail: false },
    );
    return true;
  }

  const note = await loadNote(entry.entityId);
  if (!note) return true;
  const course = note.courseId ? await db.get('courses', note.courseId) : null;
  const unit = note.unitId ? await db.get('units', note.unitId) : null;
  if ((note.courseId && !course?.cloudId) || (note.unitId && !unit?.cloudId)) {
    if (course && !course.cloudId) await queueMutation('course', course.id);
    if (unit && !unit.cloudId) await queueMutation('unit', unit.id);
    return false;
  }

  const result = await postMutation({
    entity: 'note',
    entityId: note.id,
    operation: 'upsert',
    payload: notePayload(note, course?.cloudId ?? null, unit?.cloudId ?? null),
    baseRevision: note.cloudRevision ?? null,
    clientUpdatedAt: new Date(note.updatedAt).toISOString(),
    deviceId,
  });

  if (result.outcome === 'cloud-wins' && note.generated) {
    await snapshot(note.id, note.generated, 'restore', 'Local copy before sync');
  }
  if (result.outcome === 'inserted' || result.outcome === 'applied') {
    await saveNote(
      {
        ...note,
        cloudId: result.id ?? note.cloudId,
        cloudRevision: result.revision ?? note.cloudRevision,
        cloudUpdatedAt: result.updatedAt ?? note.cloudUpdatedAt,
      },
      { queue: false, preserveUpdatedAt: true },
    );
  }
  return true;
}

async function postMutation(body: Record<string, unknown>): Promise<PushResponse> {
  const response = await fetch('/api/sync/push', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error('sync push failed');
  return (await response.json()) as PushResponse;
}

export async function pullCloud(ownerId: string): Promise<void> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
  const meta = await syncMeta(ownerId);
  const since = meta?.lastPulledAt ? `?since=${encodeURIComponent(meta.lastPulledAt)}` : '';
  const response = await fetch(`/api/sync/pull${since}`, { cache: 'no-store' });
  if (!response.ok) return;
  const pulled = (await response.json()) as PullResponse;
  const db = await getDb();
  if (!db) return;
  const pending = new Set((await listOutbox()).map((entry) => `${entry.entity}:${entry.entityId}`));

  // An incremental pull returns only the courses and units that changed, so the maps start from
  // the mirror. Without that, a note whose course was untouched would resolve to no course at all
  // and quietly unfile itself from the tree.
  const localCourses = await db.getAll('courses');
  const courseByCloud = new Map<string, LocalCourse>();
  for (const course of localCourses) if (course.cloudId) courseByCloud.set(course.cloudId, course);
  for (const row of pulled.courses) {
    const cloudId = string(row.id);
    const localId = nullableString(row.local_id) ?? `crs_cloud_${cloudId}`;
    const existing = localCourses.find(
      (course) => course.id === localId || course.cloudId === cloudId,
    );
    const course: LocalCourse = {
      id: existing?.id ?? localId,
      cloudId,
      ownerId,
      subject: string(row.subject),
      curriculum: string(row.curriculum),
      name: string(row.name),
      packId: nullableString(row.pack_id),
      color: nullableString(row.color),
      ordinal: number(row.ordinal),
      createdAt: dateMs(row.created_at),
      updatedAt: dateMs(row.updated_at),
    };
    if (!pending.has(`course:${course.id}`)) await saveCourse(course, false);
    courseByCloud.set(cloudId, course);
  }

  const localUnits = await db.getAll('units');
  const unitByCloud = new Map<string, LocalUnit>();
  for (const unit of localUnits) if (unit.cloudId) unitByCloud.set(unit.cloudId, unit);
  for (const row of pulled.units) {
    const cloudId = string(row.id);
    const course = courseByCloud.get(string(row.course));
    if (!course) continue;
    const localId = nullableString(row.local_id) ?? `unt_cloud_${cloudId}`;
    const existing = localUnits.find((unit) => unit.id === localId || unit.cloudId === cloudId);
    const unit: LocalUnit = {
      id: existing?.id ?? localId,
      cloudId,
      courseId: course.id,
      name: string(row.name),
      ordinal: number(row.ordinal),
      createdAt: dateMs(row.created_at),
      updatedAt: dateMs(row.updated_at),
    };
    if (!pending.has(`unit:${unit.id}`)) await saveUnit(unit, false);
    unitByCloud.set(cloudId, unit);
  }

  const localNotes = await listNotes(10_000);
  const cloudNoteIds = new Set<string>(pulled.noteIds ?? []);
  for (const row of pulled.notes) {
    const cloudId = string(row.id);
    cloudNoteIds.add(cloudId);
    const localId = nullableString(row.local_id) ?? `note-cloud-${cloudId}`;
    const existing = localNotes.find(
      (note) => note.localId === localId || note.cloudId === cloudId,
    );
    if (existing && pending.has(`note:${existing.id}`)) continue;
    const generated = noteDocument(row.doc);
    const source = sourceValue(row.source, existing);
    const note: LocalNote = {
      id: existing?.id ?? `nte_cloud_${cloudId.replaceAll('-', '')}`,
      localId,
      cloudId,
      cloudRevision: number(row.sync_revision),
      cloudUpdatedAt: string(row.updated_at),
      courseId: courseByCloud.get(string(row.course))?.id ?? existing?.courseId ?? null,
      unitId: unitByCloud.get(string(row.unit))?.id ?? existing?.unitId ?? null,
      thumbnailPath: nullableString(row.thumbnail_path),
      exportedAt: nullableString(row.exported_at),
      notionSyncedAt: nullableString(row.notion_synced_at),
      conflictOf: nullableString(row.conflict_of),
      conflictStatus: conflictStatus(row.conflict_status),
      createdAt: dateMs(row.created_at),
      updatedAt: dateMs(row.client_updated_at ?? row.updated_at),
      title: string(row.title) || generated?.title || 'Untitled',
      status: noteStatus(row.status),
      context: generated?.context ?? existing?.context ?? DEFAULT_CONTEXT,
      options: generated?.options ?? existing?.options ?? DEFAULT_OPTIONS,
      draftId: existing?.draftId ?? `cloud:${cloudId}`,
      source,
      doc: existing?.doc ?? toStoredDoc(emptyDoc()),
      generated: generated ?? existing?.generated,
      edited: boolean(row.edited),
    };
    await saveNote(note, { queue: false, preserveUpdatedAt: true });
  }

  // A deletion on another device removes the mirror only when this browser has no unsent edit —
  // and only when the server actually listed every id, or an incremental pull would look like a
  // remote deletion of everything it did not mention.
  for (const note of pulled.noteIds ? localNotes : []) {
    if (!note.cloudId || cloudNoteIds.has(note.cloudId) || pending.has(`note:${note.id}`)) continue;
    const tx = db.transaction(['notes', 'versions', 'assets'], 'readwrite');
    const versions = await tx.objectStore('versions').index('by-note').getAllKeys(note.id);
    const assets = await tx.objectStore('assets').index('by-note').getAllKeys(note.id);
    await Promise.all([
      tx.objectStore('notes').delete(note.id),
      ...versions.map((key) => tx.objectStore('versions').delete(key)),
      ...assets.map((key) => tx.objectStore('assets').delete(key)),
    ]);
    await tx.done;
  }

  await db.put('syncMeta', {
    id: 'state',
    deviceId: meta?.deviceId ?? crypto.randomUUID(),
    ownerId,
    lastPulledAt: pulled.pulledAt,
  });
  notifyLibraryChanged();
}

export function startSync(ownerId: string): () => void {
  const sync = () => void drainOutbox(ownerId).then(() => pullCloud(ownerId));
  const focus = () => {
    if (document.visibilityState === 'visible') sync();
  };
  window.addEventListener('online', sync);
  window.addEventListener('focus', sync);
  document.addEventListener('visibilitychange', focus);
  const interval = window.setInterval(sync, 60_000);
  return () => {
    window.removeEventListener('online', sync);
    window.removeEventListener('focus', sync);
    document.removeEventListener('visibilitychange', focus);
    window.clearInterval(interval);
  };
}

export function notifyLibraryChanged(): void {
  const channel = new BroadcastChannel('lumen-library');
  channel.postMessage('changed');
  channel.close();
}

function coursePayload(course: LocalCourse): Record<string, unknown> {
  return {
    localId: course.id,
    subject: course.subject,
    curriculum: course.curriculum,
    name: course.name,
    packId: course.packId ?? null,
    color: course.color ?? null,
    ordinal: course.ordinal,
  };
}

function unitPayload(unit: LocalUnit, cloudCourseId: string): Record<string, unknown> {
  return {
    localId: unit.id,
    course: cloudCourseId,
    name: unit.name,
    ordinal: unit.ordinal,
  };
}

function notePayload(
  note: LocalNote,
  cloudCourseId: string | null,
  cloudUnitId: string | null,
): Record<string, unknown> {
  return {
    localId: note.localId,
    course: cloudCourseId,
    unit: cloudUnitId,
    title: note.title,
    subject: note.context.subject,
    curriculum: note.context.curriculum === 'UNKNOWN' ? null : note.context.curriculum,
    topic: note.context.topic,
    language: note.context.language,
    mode: note.options.mode,
    status: note.status,
    doc: note.generated ?? null,
    source: note.source,
    stats: note.generated?.stats ?? null,
    createdAt: new Date(note.createdAt).toISOString(),
    edited: Boolean(note.edited),
    thumbnailPath: note.thumbnailPath ?? null,
    searchText: flattenDocument(note.generated),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
const string = (value: unknown): string => (typeof value === 'string' ? value : '');
const nullableString = (value: unknown): string | null => {
  const found = string(value);
  return found || null;
};
const number = (value: unknown): number => {
  const found = Number(value ?? 0);
  return Number.isFinite(found) ? found : 0;
};
const boolean = (value: unknown): boolean => value === true;
const dateMs = (value: unknown): number => {
  const found = Date.parse(string(value));
  return Number.isFinite(found) ? found : Date.now();
};
const noteStatus = (value: unknown): LocalNote['status'] =>
  value === 'draft' || value === 'generating' || value === 'ready' || value === 'error'
    ? value
    : 'ready';
const conflictStatus = (value: unknown): LocalNote['conflictStatus'] =>
  value === 'unresolved' || value === 'resolved' ? value : null;
const noteDocument = (value: unknown): NoteDocument | null =>
  isRecord(value) && Array.isArray(value.sections) ? (value as unknown as NoteDocument) : null;

function sourceValue(value: unknown, existing: LocalNote | undefined): LocalNote['source'] {
  if (!isRecord(value))
    return (
      existing?.source ?? {
        kind: 'paste',
        filenames: [],
        extractedCharCount: 0,
        ocrPages: 0,
      }
    );
  const kind = value.kind === 'upload' || value.kind === 'mixed' ? value.kind : 'paste';
  return {
    kind,
    filenames: Array.isArray(value.filenames)
      ? value.filenames.filter((item): item is string => typeof item === 'string')
      : [],
    extractedCharCount: number(value.extractedCharCount ?? value.extracted_char_count),
    ocrPages: number(value.ocrPages ?? value.ocr_pages),
  };
}
