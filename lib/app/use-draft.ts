'use client';

import { useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { useDraftStore } from '@/lib/store/draft-store';

import { DRAFT_PARAM } from './routes';

/**
 * Loads the draft named by `?d=`, or starts one, and keeps the URL pointing at it.
 *
 * This is the whole of the "refresh at any point and lose nothing" requirement. The draft id lives
 * in the URL, so a reload re-reads the same record out of IndexedDB, the back button works, and a
 * second tab is a second draft rather than a silent fight over one.
 *
 * `router.replace` rather than `push`: creating a draft is not a navigation the student made, and
 * it should not put an entry in their history for the back button to land on.
 */
export function useDraft(basePath: string) {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const draftId = params.get(DRAFT_PARAM);

  const draft = useDraftStore((state) => state.draft);
  const hydrated = useDraftStore((state) => state.hydrated);
  const hydrate = useDraftStore((state) => state.hydrate);

  useEffect(() => {
    // Already holding the draft the URL asks for — a re-render, not a navigation.
    if (draftId && draft?.id === draftId) return;
    // No id in the URL and a draft already in hand: the URL is what is stale, not the store.
    if (!draftId && draft) return;
    void hydrate(draftId);
  }, [draftId, draft, hydrate]);

  useEffect(() => {
    // Only while this screen is still the screen. During a navigation away, the search params read
    // as empty for a moment before the route changes — and without this guard that looked exactly
    // like "the URL has lost its draft id", so the effect replaced it and cancelled the navigation
    // the student had just started.
    if (pathname !== basePath) return;
    if (draft && draft.id !== draftId) {
      router.replace(`${basePath}?${DRAFT_PARAM}=${draft.id}`, { scroll: false });
    }
  }, [draft, draftId, router, basePath, pathname]);

  return { draft, hydrated };
}
