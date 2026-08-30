import { Suspense } from 'react';
import type { Metadata } from 'next';

import { SkeletonParagraph } from '@/components/ui/skeleton';
import { ReviewScreen } from '@/lib/app/screens/review-screen';

export const metadata: Metadata = {
  title: 'Check what we read',
  robots: { index: false, follow: false },
};

export default function ReviewPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto w-full max-w-[76rem] px-5 py-8">
          <SkeletonParagraph lines={6} />
        </main>
      }
    >
      <ReviewScreen />
    </Suspense>
  );
}
