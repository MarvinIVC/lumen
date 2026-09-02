import type { Metadata } from 'next';
import Link from 'next/link';

import { NoteDocument } from '@/lib/render/NoteDocument';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { FileIcon } from '@/components/ui/icons';
import { appStrings } from '@/lib/app/strings';
import { readSharedNote, shareCardUrl } from '@/lib/app/shared-note.server';
import { migrateNoteDocument } from '@/lib/ai/validate';

/**
 * **Never cached, and that is the whole feature.**
 *
 * Revoke and expiry are evaluated on every read inside `shared_note()`. Phase-02's incremental
 * cache is `staticAssetsIncrementalCache`, which cannot revalidate or write — so a share page that
 * was cacheable could never be withdrawn, and "revoke" would be a button that did nothing anybody
 * could observe.
 */
export const dynamic = 'force-dynamic';

const strings = appStrings.share;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ shareId: string }>;
}): Promise<Metadata> {
  const { shareId } = await params;
  const result = await readSharedNote(shareId);

  if (!result.ok) {
    return { title: strings.goneTitle, robots: { index: false, follow: false } };
  }

  const { note } = result;
  return {
    title: note.title,
    description: note.doc.summary?.slice(0, 200) ?? strings.tagline,
    // 06 §4: not indexed unless the owner opted in. `noindex` is the default on the row, so this
    // is the row's answer rather than a guess.
    robots: note.allowIndex
      ? { index: true, follow: true }
      : { index: false, follow: false, nocache: true },
    openGraph: {
      title: note.title,
      description: note.doc.summary?.slice(0, 200) ?? strings.tagline,
      type: 'article',
      ...(note.ogPath
        ? { images: [{ url: shareCardUrl(note.ogPath), width: 1200, height: 630 }] }
        : {}),
    },
    twitter: {
      card: note.ogPath ? 'summary_large_image' : 'summary',
      title: note.title,
      ...(note.ogPath ? { images: [shareCardUrl(note.ogPath)] } : {}),
    },
  };
}

/**
 * `/s/:shareId` — a read-only study guide, for anyone with the link (06 §4).
 *
 * The same renderer as the workspace with none of its writes: no editing, no accept/reject, no
 * study progress and no provenance controls. It is server-rendered so the text is there for a
 * reader — and for a crawler — before any JavaScript runs; the heavy renderers hydrate afterwards,
 * exactly as they do everywhere else.
 */
export default async function SharedNotePage({ params }: { params: Promise<{ shareId: string }> }) {
  const { shareId } = await params;
  const result = await readSharedNote(shareId);

  if (!result.ok) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-(--note-shell) items-center px-5 py-16">
        <EmptyState
          icon={<FileIcon />}
          title={result.throttled ? strings.busyTitle : strings.goneTitle}
          description={result.throttled ? strings.busyBody : strings.goneBody}
          action={
            <Button asChild variant="primary">
              <Link href="/">{strings.cta}</Link>
            </Button>
          }
        />
      </main>
    );
  }

  const { note } = result;

  return (
    <main className="min-h-dvh">
      {/* Migrated on the way in, exactly as the workspace does it: a document written before the
          current schema still has to render, and block ids are minted here. */}
      <NoteDocument doc={migrateNoteDocument(note.doc)} />

      <footer className="mx-auto w-full max-w-(--note-shell) border-t border-border px-5 py-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="font-sans text-sm text-text-muted">
            {strings.madeWith}{' '}
            <Link href="/" className="underline underline-offset-2 hover:text-text">
              Lumen
            </Link>
            . {strings.tagline}
          </p>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <a href={strings.reportHref(shareId)}>{strings.report}</a>
            </Button>
            <Button asChild variant="primary" size="sm">
              <Link href="/app/new">{strings.cta}</Link>
            </Button>
          </div>
        </div>
        <p className="mt-4 font-sans text-xs text-text-muted">{strings.disclaimer}</p>
      </footer>
    </main>
  );
}
