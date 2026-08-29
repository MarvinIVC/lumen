'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { CommandMenu, useCommandMenuShortcut } from '@/components/ui/command-menu';
import { BookIcon, UploadIcon } from '@/components/ui/icons';
import { FlashcardDeck } from '@/components/study/flashcard-deck';
import { QuizRunner } from '@/components/study/quiz-runner';
import { goldFixture } from '@/lib/render/fixture/gold';

/**
 * The study tools and the command menu, on one page, so the keyboard path through them can be
 * exercised end to end (phase-01 verification step 2). Shells — phase-08 owns the behaviour — but
 * the keyboard model is settled here and is worth holding.
 */
export default function StudyToolsPage() {
  const doc = goldFixture();
  const [open, setOpen] = useState(false);
  useCommandMenuShortcut(() => setOpen(true));

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-10 px-5 py-10">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-semibold text-text">Study tools</h1>
          <p className="mt-2 font-sans text-text-muted">
            Flashcards, the quiz, and the command menu — all reachable without a mouse.
          </p>
        </div>
        <Button onClick={() => setOpen(true)} trailing="⌘K">
          Search
        </Button>
      </header>

      <section className="grid gap-10 lg:grid-cols-2">
        <div className="flex flex-col gap-3">
          <h2 className="font-sans text-xs font-semibold tracking-wider text-text-muted uppercase">
            Flashcards
          </h2>
          <FlashcardDeck cards={doc.studyTools.flashcards} />
        </div>

        <div className="flex flex-col gap-3">
          <h2 className="font-sans text-xs font-semibold tracking-wider text-text-muted uppercase">
            Quiz
          </h2>
          <QuizRunner items={doc.studyTools.quiz} />
        </div>
      </section>

      <CommandMenu
        open={open}
        onOpenChange={setOpen}
        items={[
          {
            id: 'new',
            label: 'New study guide',
            keywords: 'create upload add',
            group: 'Actions',
            icon: <UploadIcon />,
            shortcut: '⌘N',
            onSelect: () => {},
          },
          {
            id: 'note',
            label: 'AP Chemistry · Unit 1 — Atomic Structure & Properties',
            group: 'Your notes',
            icon: <BookIcon />,
            onSelect: () => {},
          },
        ]}
      />
    </main>
  );
}
