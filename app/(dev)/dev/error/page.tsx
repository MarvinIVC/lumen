'use client';

import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
import {
  AlertTriangleIcon,
  BookIcon,
  FlaskIcon,
  ImageIcon,
  UploadIcon,
} from '@/components/ui/icons';
import { QuotaMeter } from '@/components/domain/quota-meter';

/**
 * Hero screen 3: the states nobody designs and everybody meets.
 *
 * Every one of these follows 01-PRODUCT.md §6 — say what happened, why, and what to do next — and
 * none of them apologises or blames the student. "That PDF is a scan" is a fact about the file;
 * "Oops! Something went wrong" is a shrug.
 */
export default function ErrorStatesPage() {
  const toast = useToast();

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-5 py-10">
      <header>
        <h1 className="font-serif text-3xl font-semibold text-text">When things go wrong</h1>
        <p className="mt-2 font-sans text-text-muted">
          Error and empty states, in the product&rsquo;s own voice.
        </p>
      </header>

      <Section title="The file could not be read">
        <EmptyState
          tone="warning"
          icon={<ImageIcon />}
          title="That PDF is a scan, not text"
          description="There is no text layer in it, so there is nothing for us to read. Running OCR turns the pictures into words — or you can paste the text in directly."
          action={<Button variant="primary">Run OCR</Button>}
          secondaryAction={<Button variant="ghost">Paste text instead</Button>}
        />
      </Section>

      <Section title="These are not study notes">
        <EmptyState
          icon={<AlertTriangleIcon />}
          title="This looks like a recipe"
          description="We only rebuild class notes — lecture notes, a textbook chapter, a lab write-up. If we have got this wrong, tell us what the subject is and we will try again."
          action={<Button variant="primary">It is study notes — continue</Button>}
          secondaryAction={<Button variant="ghost">Upload something else</Button>}
        />
      </Section>

      <Section title="The daily allowance is used up">
        <div className="flex flex-col gap-4 rounded-lg border border-border bg-bg-raised p-5">
          <QuotaMeter used={5} total={5} resetsIn="at midnight" />
          <div className="flex flex-wrap gap-2">
            <Button variant="primary">Add my own API key</Button>
            <Button variant="ghost">Remind me tomorrow</Button>
          </div>
        </div>
      </Section>

      <Section title="Generation stopped part-way">
        <EmptyState
          tone="danger"
          icon={<AlertTriangleIcon />}
          title="We lost the connection at section 3"
          description="The first two sections are saved and readable. Picking up from section 3 does not cost another credit."
          action={<Button variant="primary">Carry on from section 3</Button>}
          secondaryAction={<Button variant="ghost">Keep what we have</Button>}
        />
      </Section>

      <Section title="Nothing here yet">
        <EmptyState
          icon={<BookIcon />}
          title="Your library is empty"
          description="Upload the notes you already have — a Word file, a PDF, or a photo of the whiteboard."
          action={
            <Button variant="primary" icon={<UploadIcon />}>
              Add notes
            </Button>
          }
        />
      </Section>

      <Section title="Told in passing, not in the way">
        <div className="flex flex-wrap gap-2">
          <Button
            icon={<FlaskIcon />}
            onClick={() =>
              toast({
                title: 'Saved to your library',
                description: 'AP Chemistry · Unit 1.',
                tone: 'success',
              })
            }
          >
            Success toast
          </Button>
          <Button
            onClick={() =>
              toast({
                title: 'Notion revoked our access',
                description: 'Your notes are untouched. Reconnect to keep pushing to Notion.',
                tone: 'warning',
                action: { label: 'Reconnect', onClick: () => {} },
              })
            }
          >
            Recoverable failure
          </Button>
          <Button
            onClick={() =>
              toast({
                title: 'That file is 48 MB',
                description: 'The limit is 20 MB per file. Splitting it in two usually does it.',
                tone: 'danger',
              })
            }
          >
            Hard failure
          </Button>
        </div>
      </Section>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-sans text-xs font-semibold tracking-wider text-text-muted uppercase">
        {title}
      </h2>
      {children}
    </section>
  );
}
