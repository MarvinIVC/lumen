import { APP_NAME, APP_TAGLINE } from '@/lib/config';

/**
 * The share card's identity, in one place.
 *
 * `app/opengraph-image.tsx` draws it; `metadata.ts` has to point at it explicitly, because a route
 * that returns an `openGraph` object from `generateMetadata` *replaces* the one it inherited —
 * file-based images included. Without this the pages that need per-route OG titles are the exact
 * pages that silently lose their image, which is the wrong way round and easy to miss: every other
 * OG tag is present and correct.
 *
 * The URL carries no cache-busting hash. Next serves the generated file at this path too, and a
 * hash we cannot know at this point is not worth a second source of truth.
 */
export const OG_IMAGE = {
  url: '/opengraph-image',
  width: 1200,
  height: 630,
  alt: `${APP_NAME} — ${APP_TAGLINE}`,
} as const;
