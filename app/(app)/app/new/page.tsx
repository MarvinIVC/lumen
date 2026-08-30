import { Suspense } from 'react';
import type { Metadata } from 'next';

import { SkeletonParagraph } from '@/components/ui/skeleton';
import { NewScreen } from '@/lib/app/screens/new-screen';

export const metadata: Metadata = {
  title: 'New study guide',
  // The workspace is personal and holds nothing worth indexing.
  robots: { index: false, follow: false },
};

/**
 * `useSearchParams` makes its component bail out of prerendering, and Next requires the boundary
 * to be explicit rather than swallowing the whole page. Keeping it here means the shell and the
 * heading are still static HTML.
 */
export default function NewPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto w-full max-w-[56rem] px-5 py-10">
          <SkeletonParagraph lines={4} />
        </main>
      }
    >
      <NewScreen />
    </Suspense>
  );
}
