import type { ReactNode } from 'react';

/**
 * Layout scaffolding for stories only — never imported by the app. Kept here rather than in
 * /components so nothing in the shipped tree exists purely for documentation.
 */

export function Row({
  children,
  align = 'center',
}: {
  children: ReactNode;
  align?: 'center' | 'end' | 'start';
}) {
  return (
    <div className="flex flex-wrap gap-3" style={{ alignItems: align }}>
      {children}
    </div>
  );
}

export function Stack({ children, gap = 16 }: { children: ReactNode; gap?: number }) {
  return (
    <div className="flex flex-col" style={{ gap }}>
      {children}
    </div>
  );
}

/** A labelled group, so a variants story reads as a spec sheet rather than a pile. */
export function Case({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium tracking-wide text-text-muted">{label}</p>
      {children}
    </div>
  );
}

/** Constrains a story to a realistic panel width instead of letting it sprawl. */
export function Panel({ children, width = 360 }: { children: ReactNode; width?: number }) {
  return <div style={{ width }}>{children}</div>;
}
