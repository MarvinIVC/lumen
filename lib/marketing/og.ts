import { APP_NAME, APP_TAGLINE } from '@/lib/config';

/**
 * The share card's identity, in one place.
 *
 * A plain static file, not an `app/opengraph-image.tsx` route. That route works, and it is the
 * idiomatic answer, but `next/og` carries resvg and yoga as WebAssembly and OpenNext bundles them
 * into the Cloudflare Worker whether or not the image is prerendered — 1.4 MB that took the Worker
 * past Cloudflare's 3 MiB free-plan ceiling and failed the deploy outright. `pnpm og:build` renders
 * it instead, and the WASM stays on the build machine.
 *
 * `metadata.ts` has to point at this explicitly in any case: a route returning an `openGraph`
 * object from `generateMetadata` *replaces* the one it inherited, file-based images included. That
 * failure is quiet — every other OG tag stays present and correct.
 */
export const OG_IMAGE = {
  url: '/og.png',
  width: 1200,
  height: 630,
  alt: `${APP_NAME} — ${APP_TAGLINE}`,
} as const;
