import type { ReactNode } from 'react';

import { cn } from '@/lib/utils/cn';

/**
 * The rhythm every marketing section shares (03-DESIGN.md §8): a wide measure of paper, generous
 * vertical space, and a hairline above rather than a box around.
 *
 * The rule that the divider is a top border on each section — not a `<hr>` between them — is what
 * makes each section croppable: the first thing inside a screenshot is a clean edge, and the last
 * is whitespace. `03-DESIGN.md` §8 asks for sections that read well as shared images, and this is
 * the mechanical part of that.
 */
export function Section({
  id,
  children,
  className,
  divider = true,
  width = 'wide',
  labelledBy,
}: {
  id?: string;
  children: ReactNode;
  className?: string;
  divider?: boolean;
  width?: 'wide' | 'prose';
  labelledBy?: string;
}) {
  return (
    <section
      id={id}
      aria-labelledby={labelledBy}
      // Anchored sections must not land under a header, and `#real-lesson` is a primary CTA target.
      className={cn('scroll-mt-16', divider && 'border-t border-border')}
    >
      {/*
        Every section shares one container and one left margin, whatever its measure. Centring the
        prose sections inside the page instead would give the scroll two different left edges — the
        wide sections starting at the margin, the narrow ones floating in from it — which reads as
        misalignment rather than as a change of rhythm.
      */}
      <div className="mx-auto max-w-[72rem] px-6 py-20 sm:py-28">
        <div className={cn(width === 'prose' && 'max-w-[46rem]', className)}>{children}</div>
      </div>
    </section>
  );
}

/** One big serif headline per section, and never two competing weights inside it. */
export function SectionHeading({
  id,
  children,
  className,
}: {
  id?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <h2
      id={id}
      className={cn(
        'max-w-(--measure) font-serif text-2xl leading-tight font-semibold text-balance text-text sm:text-3xl',
        className,
      )}
    >
      {children}
    </h2>
  );
}

/** The paragraph under a section heading. Muted, one measure wide, never more than three lines. */
export function SectionLede({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn('mt-5 max-w-(--measure) text-md leading-normal text-text-muted', className)}>
      {children}
    </p>
  );
}

/** The small uppercase label that names a section without competing with its headline. */
export function SectionKicker({ children }: { children: ReactNode }) {
  return (
    <p className="mb-4 font-mono text-xs tracking-widest text-text-muted uppercase">{children}</p>
  );
}
