import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[46rem] flex-col justify-center px-6 py-16">
      <p className="font-mono text-xs tracking-widest text-text-faint uppercase">404</p>
      <h1 className="mt-6 font-serif text-2xl font-semibold text-text">
        This page isn&rsquo;t here.
      </h1>
      <p className="mt-4 font-serif text-md leading-note text-text-muted">
        The link may be old, or the note may have been deleted.
      </p>
      <p className="mt-8 text-sm">
        <Link href="/">Back to the start</Link>
      </p>
    </main>
  );
}
