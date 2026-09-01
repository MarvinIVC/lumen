'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { LibraryTree } from '@/components/domain/library-tree';
import type { LibraryNode } from '@/components/domain/library-tree';
import { NoteCard } from '@/components/domain/note-card';
import { SubjectPicker } from '@/components/domain/subject-picker';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { BookIcon, PlusIcon, SearchIcon, TrashIcon } from '@/components/ui/icons';
import { Select, SelectItem } from '@/components/ui/select';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/lib/auth/auth-provider';
import { APP_NEW, noteHref } from '@/lib/app/routes';
import { appStrings } from '@/lib/app/strings';
import { useSyncStatus } from '@/lib/store/sync-provider';
import { getAsset, saveNote } from '@/lib/store/drafts';
import {
  colorCourse,
  combineFlashcards,
  createCourse,
  createUnit,
  loadLibrary,
  moveNote,
  placeAllNotes,
  removeNotes,
  renameCourse,
  renameUnit,
  reorderCourses,
  reorderUnits,
  searchLocalNotes,
} from '@/lib/store/library';
import type { LibrarySnapshot } from '@/lib/store/library';
import type { LocalCourse, LocalNote, LocalUnit } from '@/lib/store/types';

const EMPTY: LibrarySnapshot = { courses: [], units: [], notes: [] };
const SUBJECTS = [
  'General',
  'Chemistry',
  'Biology',
  'Physics',
  'Mathematics',
  'History',
  'English',
];
const CURRICULA = ['GENERAL', 'AP', 'IB_HL', 'IB_SL', 'A_LEVEL', 'IGCSE', 'INTERNAL'];
const COLORS = [
  ['', appStrings.library.colorNone],
  ['accent', appStrings.library.colorAccent],
  ['success', appStrings.library.colorSuccess],
  ['warning', appStrings.library.colorWarning],
] as const;

type EditTarget =
  { kind: 'course'; value?: LocalCourse } | { kind: 'unit'; courseId: string; value?: LocalUnit };

export function LibraryScreen() {
  const { user, openSignIn } = useAuth();
  const syncStatus = useSyncStatus();
  const toast = useToast();
  const [library, setLibrary] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [selectedNode, setSelectedNode] = useState('all');
  const [query, setQuery] = useState('');
  const [cloudMatches, setCloudMatches] = useState<Set<string>>(new Set());
  const [subject, setSubject] = useState('all');
  const [curriculum, setCurriculum] = useState('all');
  const [date, setDate] = useState('all');
  const [openOnly, setOpenOnly] = useState(false);
  const [notReviewed, setNotReviewed] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
  const [moveOpen, setMoveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deckOpen, setDeckOpen] = useState(false);
  const [moveUnitId, setMoveUnitId] = useState('');
  const [thumbnailUrls, setThumbnailUrls] = useState<Record<string, string>>({});
  const objectUrls = useRef<string[]>([]);

  const reload = useCallback(async () => {
    await placeAllNotes();
    const next = await loadLibrary();
    for (const url of objectUrls.current) URL.revokeObjectURL(url);
    objectUrls.current = [];
    const pairs = await Promise.all(
      next.notes.map(async (note) => {
        if (!note.thumbnailAssetId) return null;
        const asset = await getAsset(note.thumbnailAssetId);
        if (!asset) return null;
        const url = URL.createObjectURL(new Blob([asset.bytes], { type: asset.mime }));
        objectUrls.current.push(url);
        return [note.id, url] as const;
      }),
    );
    setThumbnailUrls(Object.fromEntries(pairs.filter((pair) => pair !== null)));
    setLibrary(next);
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
    const channel = new BroadcastChannel('lumen-library');
    channel.addEventListener('message', reload);
    return () => {
      channel.close();
      for (const url of objectUrls.current) URL.revokeObjectURL(url);
    };
  }, [reload]);

  useEffect(() => {
    if (!user || !query.trim() || !navigator.onLine) {
      setCloudMatches(new Set());
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void fetch(`/api/library/search?q=${encodeURIComponent(query)}`, {
        signal: controller.signal,
      })
        .then((response) => (response.ok ? response.json() : { ids: [] }))
        .then((body: { ids?: string[] }) => setCloudMatches(new Set(body.ids ?? [])))
        .catch(() => undefined);
    }, 180);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, user]);

  const tree = useMemo(() => buildTree(library), [library]);
  const visible = useMemo(() => {
    const localMatches = new Set(searchLocalNotes(library.notes, query).map((note) => note.id));
    const now = Date.now();
    return library.notes.filter((note) => {
      if (query.trim() && !localMatches.has(note.id) && !cloudMatches.has(note.cloudId ?? ''))
        return false;
      if (!matchesNode(note, selectedNode, library)) return false;
      if (subject !== 'all' && note.context.subject !== subject) return false;
      if (curriculum !== 'all' && note.context.curriculum !== curriculum) return false;
      if (date === 'week' && now - note.updatedAt > 7 * 86_400_000) return false;
      if (date === 'month' && now - note.updatedAt > 30 * 86_400_000) return false;
      if (openOnly && (note.generated?.stats?.openQuestions ?? 0) === 0) return false;
      if (notReviewed && !hasUnreviewedAi(note)) return false;
      return true;
    });
  }, [
    cloudMatches,
    curriculum,
    date,
    library,
    notReviewed,
    openOnly,
    query,
    selectedNode,
    subject,
  ]);

  const selectedNotes = library.notes.filter((note) => selected.has(note.id));
  const selectedCourse = selectedNode.startsWith('course:')
    ? library.courses.find((row) => row.id === selectedNode.slice(7))
    : undefined;
  const selectedUnit = selectedNode.startsWith('unit:')
    ? library.units.find((row) => row.id === selectedNode.slice(5))
    : undefined;
  const parentCourse = selectedUnit
    ? library.courses.find((row) => row.id === selectedUnit.courseId)
    : selectedCourse;

  const clearFilters = () => {
    setQuery('');
    setSubject('all');
    setCurriculum('all');
    setDate('all');
    setOpenOnly(false);
    setNotReviewed(false);
    setSelectedNode('all');
  };

  const refreshAfter = async (work: Promise<unknown>, message?: string) => {
    await work;
    await reload();
    if (message) toast({ title: message });
  };

  const moveSelected = async () => {
    if (!moveUnitId) return;
    await Promise.all(selectedNotes.map((note) => moveNote(note.id, moveUnitId)));
    setMoveOpen(false);
    setSelected(new Set());
    await reload();
    toast({ title: appStrings.library.moved });
  };

  const deleteSelected = async () => {
    await removeNotes([...selected]);
    setDeleteOpen(false);
    setSelected(new Set());
    await reload();
    toast({ title: appStrings.library.deleted });
  };

  const resolveConflict = async (note: LocalNote, keepBoth: boolean) => {
    if (!keepBoth) {
      const related = library.notes.filter(
        (candidate) =>
          candidate.id !== note.id &&
          (candidate.cloudId === note.conflictOf ||
            candidate.conflictOf === note.cloudId ||
            (note.conflictOf && candidate.conflictOf === note.conflictOf)),
      );
      await removeNotes(related.map((candidate) => candidate.id));
    }
    await saveNote({ ...note, conflictStatus: 'resolved', conflictOf: null });
    await reload();
  };

  return (
    <main className="mx-auto grid w-full max-w-[76rem] flex-1 gap-6 px-5 py-8 lg:grid-cols-[17rem_minmax(0,1fr)]">
      <aside className="flex flex-col gap-4 lg:border-r lg:border-border lg:pr-5">
        <Button variant="primary" asChild fullWidth icon={<PlusIcon />}>
          <Link href={APP_NEW}>{appStrings.library.newNote}</Link>
        </Button>
        <button
          type="button"
          onClick={() => setSelectedNode('all')}
          className="rounded-sm px-2 py-2 text-left text-sm font-medium text-text hover:bg-bg-sunken"
        >
          {appStrings.library.allNotes}{' '}
          <span className="text-text-muted">{library.notes.length}</span>
        </button>
        <LibraryTree
          nodes={tree}
          selectedId={selectedNode}
          onSelect={setSelectedNode}
          onDropNote={(noteId, unitId) =>
            void refreshAfter(moveNote(noteId, unitId), appStrings.library.moved)
          }
          ariaLabel={appStrings.library.treeLabel}
        />
        <div className="flex flex-wrap gap-2" aria-label={appStrings.library.treeActions}>
          <Button size="sm" onClick={() => setEditTarget({ kind: 'course' })}>
            {appStrings.library.addCourse}
          </Button>
          <Button
            size="sm"
            disabled={!parentCourse}
            onClick={() =>
              parentCourse && setEditTarget({ kind: 'unit', courseId: parentCourse.id })
            }
          >
            {appStrings.library.addUnit}
          </Button>
          {selectedCourse ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setEditTarget({ kind: 'course', value: selectedCourse })}
            >
              {appStrings.library.rename}
            </Button>
          ) : null}
          {selectedUnit ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                setEditTarget({
                  kind: 'unit',
                  courseId: selectedUnit.courseId,
                  value: selectedUnit,
                })
              }
            >
              {appStrings.library.rename}
            </Button>
          ) : null}
          {selectedCourse || selectedUnit ? (
            <ReorderButtons
              course={selectedCourse}
              unit={selectedUnit}
              library={library}
              reload={reload}
            />
          ) : null}
        </div>
      </aside>

      <section className="min-w-0">
        <header className="mb-6 flex flex-col gap-2">
          <h1 className="font-serif text-3xl font-semibold text-text">
            {appStrings.library.title}
          </h1>
          <p className="font-sans text-text-muted">{appStrings.library.lead}</p>
        </header>
        {syncStatus === 'offline' ? (
          <StatusBanner>{appStrings.library.offline}</StatusBanner>
        ) : null}
        {syncStatus === 'merging' ? (
          <StatusBanner>{appStrings.library.merging}</StatusBanner>
        ) : null}
        {!user ? (
          <StatusBanner
            action={
              <Button size="sm" onClick={openSignIn}>
                {appStrings.auth.signIn}
              </Button>
            }
          >
            <strong>{appStrings.library.signInNudge}</strong>
            <br />
            {appStrings.library.signInNudgeBody}
          </StatusBanner>
        ) : null}

        <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            icon={<SearchIcon />}
            aria-label={appStrings.library.search}
            placeholder={appStrings.library.searchPlaceholder}
            className="sm:col-span-2"
          />
          <Select
            value={subject}
            onValueChange={setSubject}
            aria-label={appStrings.library.subjectFilter}
          >
            <SelectItem value="all">{appStrings.library.subjectFilter}</SelectItem>
            {unique(library.notes.map((note) => note.context.subject)).map((value) => (
              <SelectItem key={value} value={value}>
                {value}
              </SelectItem>
            ))}
          </Select>
          <Select
            value={curriculum}
            onValueChange={setCurriculum}
            aria-label={appStrings.library.curriculumFilter}
          >
            <SelectItem value="all">{appStrings.library.curriculumFilter}</SelectItem>
            {unique(library.notes.map((note) => note.context.curriculum)).map((value) => (
              <SelectItem key={value} value={value}>
                {value}
              </SelectItem>
            ))}
          </Select>
          <Select value={date} onValueChange={setDate} aria-label={appStrings.library.dateFilter}>
            <SelectItem value="all">{appStrings.library.dateFilter}</SelectItem>
            <SelectItem value="week">{appStrings.library.dateWeek}</SelectItem>
            <SelectItem value="month">{appStrings.library.dateMonth}</SelectItem>
          </Select>
          <Checkbox
            checked={openOnly}
            onCheckedChange={(value) => setOpenOnly(value === true)}
            label={appStrings.library.openQuestionsFilter}
          />
          <Checkbox
            checked={notReviewed}
            onCheckedChange={(value) => setNotReviewed(value === true)}
            label={appStrings.library.notReviewedFilter}
          />
        </div>

        {selected.size > 0 ? (
          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-md border border-border bg-bg-sunken p-3">
            <span className="mr-auto text-sm font-medium">
              {appStrings.library.selected(selected.size)}
            </span>
            <Button size="sm" onClick={() => setMoveOpen(true)}>
              {appStrings.library.move}
            </Button>
            <Button size="sm" onClick={() => setDeckOpen(true)}>
              {appStrings.library.combineDeck}
            </Button>
            <Button size="sm" onClick={() => toast({ title: appStrings.library.exportSoon })}>
              {appStrings.library.export}
            </Button>
            <Button
              size="sm"
              variant="danger"
              icon={<TrashIcon />}
              onClick={() => setDeleteOpen(true)}
            >
              {appStrings.library.delete}
            </Button>
          </div>
        ) : null}

        {!loading && visible.length === 0 ? (
          <EmptyState
            icon={<BookIcon />}
            title={
              library.notes.length
                ? appStrings.library.noResultsTitle
                : appStrings.library.emptyTitle
            }
            description={
              library.notes.length ? appStrings.library.noResultsBody : appStrings.library.emptyBody
            }
            action={
              library.notes.length ? (
                <Button onClick={clearFilters}>{appStrings.library.clearFilters}</Button>
              ) : (
                <Button asChild variant="primary">
                  <Link href={APP_NEW}>{appStrings.library.newNote}</Link>
                </Button>
              )
            }
          />
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((note) => {
            const course = library.courses.find((row) => row.id === note.courseId);
            const unit = library.units.find((row) => row.id === note.unitId);
            return (
              <div
                key={note.id}
                draggable
                onDragStart={(event) =>
                  event.dataTransfer.setData('application/x-lumen-note', note.id)
                }
                className="relative"
              >
                <div className="absolute top-2 right-2 z-10 rounded-sm bg-bg-raised p-1 shadow-card">
                  <Checkbox
                    checked={selected.has(note.id)}
                    aria-label={appStrings.library.selectNote(note.title)}
                    onCheckedChange={(value) =>
                      setSelected((current) => {
                        const next = new Set(current);
                        if (value === true) next.add(note.id);
                        else next.delete(note.id);
                        return next;
                      })
                    }
                  />
                </div>
                <NoteCard
                  title={note.title}
                  course={course?.name ?? note.context.course ?? appStrings.library.general}
                  unit={unit?.name ?? note.context.unit}
                  updatedAt={new Date(note.updatedAt).toISOString()}
                  aiAdded={note.generated?.stats?.aiAdded ?? 0}
                  openQuestions={note.generated?.stats?.openQuestions ?? 0}
                  href={noteHref(note.id)}
                  localOnly={!note.cloudId}
                  thumbnailUrl={thumbnailUrls[note.id]}
                  exported={Boolean(note.exportedAt)}
                  inNotion={Boolean(note.notionSyncedAt)}
                  conflicted={note.conflictStatus === 'unresolved'}
                />
                {note.conflictStatus === 'unresolved' ? (
                  <div className="mt-2 rounded-md border border-warning bg-verify p-3 text-sm">
                    <p className="font-medium">{appStrings.library.conflictTitle}</p>
                    <div className="mt-2 flex gap-2">
                      <Button size="sm" onClick={() => void resolveConflict(note, false)}>
                        {appStrings.library.keepThis}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void resolveConflict(note, true)}
                      >
                        {appStrings.library.keepBoth}
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>

      <EditDialog target={editTarget} onClose={() => setEditTarget(null)} onSaved={reload} />
      <Dialog open={moveOpen} onOpenChange={setMoveOpen}>
        <DialogContent
          title={appStrings.library.moveTitle}
          description={appStrings.library.moveBody}
          footer={
            <>
              <DialogClose asChild>
                <Button>{appStrings.library.cancel}</Button>
              </DialogClose>
              <Button variant="primary" disabled={!moveUnitId} onClick={() => void moveSelected()}>
                {appStrings.library.moveHere}
              </Button>
            </>
          }
        >
          <Select
            value={moveUnitId}
            onValueChange={setMoveUnitId}
            placeholder={appStrings.library.unit}
          >
            {library.units.map((unit) => (
              <SelectItem key={unit.id} value={unit.id}>
                {library.courses.find((course) => course.id === unit.courseId)?.name} · {unit.name}
              </SelectItem>
            ))}
          </Select>
        </DialogContent>
      </Dialog>
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent
          title={appStrings.library.deleteTitle}
          description={appStrings.library.deleteBody}
          footer={
            <>
              <DialogClose asChild>
                <Button>{appStrings.library.cancel}</Button>
              </DialogClose>
              <Button variant="danger" onClick={() => void deleteSelected()}>
                {appStrings.library.deleteConfirm}
              </Button>
            </>
          }
        >
          <p>{appStrings.library.selected(selected.size)}</p>
        </DialogContent>
      </Dialog>
      <DeckDialog open={deckOpen} onOpenChange={setDeckOpen} notes={selectedNotes} />
    </main>
  );
}

function EditDialog({
  target,
  onClose,
  onSaved,
}: {
  target: EditTarget | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('General');
  const [curriculum, setCurriculum] = useState('GENERAL');
  const [color, setColor] = useState('');
  useEffect(() => {
    if (target?.value) {
      setName(target.value.name);
      if (target.kind === 'course') {
        setSubject(target.value.subject);
        setCurriculum(target.value.curriculum);
        setColor(target.value.color ?? '');
      }
    } else {
      setName('');
      setSubject('General');
      setCurriculum('GENERAL');
      setColor('');
    }
  }, [target]);
  const save = async () => {
    if (!target || !name.trim()) return;
    if (target.kind === 'course') {
      if (target.value) {
        await renameCourse(target.value.id, name);
        await colorCourse(target.value.id, color || null);
      } else await createCourse({ name: name.trim(), subject, curriculum, color: color || null });
      toast({ title: appStrings.library.courseSaved });
    } else {
      if (target.value) await renameUnit(target.value.id, name);
      else await createUnit(target.courseId, name.trim());
      toast({ title: appStrings.library.unitSaved });
    }
    await onSaved();
    onClose();
  };
  return (
    <Dialog
      open={Boolean(target)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        title={
          target?.kind === 'unit'
            ? appStrings.library.editTitleUnit
            : appStrings.library.editTitleCourse
        }
        description={target?.kind === 'unit' ? appStrings.library.unit : appStrings.library.course}
        footer={
          <>
            <DialogClose asChild>
              <Button>{appStrings.library.cancel}</Button>
            </DialogClose>
            <Button variant="primary" disabled={!name.trim()} onClick={() => void save()}>
              {appStrings.library.save}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm font-medium">
            {appStrings.library.name}
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={
                target?.kind === 'unit'
                  ? appStrings.library.unitNamePlaceholder
                  : appStrings.library.courseNamePlaceholder
              }
            />
          </label>
          {target?.kind === 'course' ? (
            <>
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium">{appStrings.library.subject}</span>
                <SubjectPicker
                  subjects={SUBJECTS.map((label) => ({ id: label, label }))}
                  selectedId={subject}
                  onSelect={setSubject}
                />
              </div>
              <label className="flex flex-col gap-1 text-sm font-medium">
                {appStrings.library.curriculum}
                <Select value={curriculum} onValueChange={setCurriculum}>
                  {CURRICULA.map((value) => (
                    <SelectItem key={value} value={value}>
                      {value}
                    </SelectItem>
                  ))}
                </Select>
              </label>
              <label className="flex flex-col gap-1 text-sm font-medium">
                {appStrings.library.color}
                <Select
                  value={color || 'none'}
                  onValueChange={(value) => setColor(value === 'none' ? '' : value)}
                >
                  {COLORS.map(([value, label]) => (
                    <SelectItem key={value || 'none'} value={value || 'none'}>
                      {label}
                    </SelectItem>
                  ))}
                </Select>
              </label>
            </>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ReorderButtons({
  course,
  unit,
  library,
  reload,
}: {
  course?: LocalCourse;
  unit?: LocalUnit;
  library: LibrarySnapshot;
  reload: () => Promise<void>;
}) {
  const move = async (delta: number) => {
    const rows = course
      ? library.courses
      : library.units.filter((row) => row.courseId === unit?.courseId);
    const id = course?.id ?? unit?.id;
    if (!id) return;
    const index = rows.findIndex((row) => row.id === id);
    const other = index + delta;
    if (other < 0 || other >= rows.length) return;
    const ids = rows.map((row) => row.id);
    [ids[index], ids[other]] = [ids[other]!, ids[index]!];
    if (course) await reorderCourses(ids);
    else if (unit) await reorderUnits(unit.courseId, ids);
    await reload();
  };
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => void move(-1)}>
        {appStrings.library.moveUp}
      </Button>
      <Button size="sm" variant="ghost" onClick={() => void move(1)}>
        {appStrings.library.moveDown}
      </Button>
    </>
  );
}

function DeckDialog({
  open,
  onOpenChange,
  notes,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  notes: LocalNote[];
}) {
  const cards = combineFlashcards(notes);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="lg"
        title={appStrings.library.combineDeckTitle}
        description={
          cards.length
            ? appStrings.library.combineDeckBody(cards.length, notes.length)
            : appStrings.library.combineDeckEmpty
        }
        footer={
          <DialogClose asChild>
            <Button>{appStrings.library.close}</Button>
          </DialogClose>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {cards.map((card, index) => (
            <div
              key={`${card.front}-${index}`}
              className="rounded-md border border-border bg-bg-sunken p-3"
            >
              <p className="font-medium">{card.front}</p>
              <p className="mt-2 text-text-muted">{card.back}</p>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StatusBanner({
  children,
  action,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex items-center gap-4 rounded-md border border-border bg-bg-sunken p-3 font-sans text-sm text-text-muted">
      <div className="mr-auto">{children}</div>
      {action}
    </div>
  );
}

function buildTree(library: LibrarySnapshot): LibraryNode[] {
  return unique(library.courses.map((course) => course.subject)).map((subject) => {
    const courses = library.courses.filter((course) => course.subject === subject);
    return {
      id: `subject:${subject}`,
      label: subject,
      kind: 'subject',
      count: courses.reduce(
        (sum, course) => sum + library.notes.filter((note) => note.courseId === course.id).length,
        0,
      ),
      children: courses.map((course) => ({
        id: `course:${course.id}`,
        label: course.name,
        kind: 'course',
        color: course.color,
        count: library.notes.filter((note) => note.courseId === course.id).length,
        children: library.units
          .filter((unit) => unit.courseId === course.id)
          .map((unit) => ({
            id: `unit:${unit.id}`,
            label: unit.name,
            kind: 'unit',
            count: library.notes.filter((note) => note.unitId === unit.id).length,
            children: library.notes
              .filter((note) => note.unitId === unit.id)
              .map((note) => ({ id: `note:${note.id}`, label: note.title, kind: 'note' })),
          })),
      })),
    } satisfies LibraryNode;
  });
}

function matchesNode(note: LocalNote, node: string, library: LibrarySnapshot): boolean {
  if (node === 'all') return true;
  if (node.startsWith('note:')) return note.id === node.slice(5);
  if (node.startsWith('unit:')) return note.unitId === node.slice(5);
  if (node.startsWith('course:')) return note.courseId === node.slice(7);
  if (node.startsWith('subject:'))
    return library.courses.find((course) => course.id === note.courseId)?.subject === node.slice(8);
  return true;
}

function hasUnreviewedAi(note: LocalNote): boolean {
  return (
    note.generated?.sections.some((section) =>
      section.blocks.some((block) => block.origin !== 'student'),
    ) ?? false
  );
}
function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}
