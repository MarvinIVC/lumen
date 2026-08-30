import { defineCloudflareConfig } from '@opennextjs/cloudflare';
import incrementalCache from '@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache';

/**
 * OpenNext adapter config (02-ARCHITECTURE.md §2).
 *
 * Phase-00 left this bare with a note that phase-02 would revisit it once the marketing routes
 * existed. It had to: **prerendered pages of a *dynamic* route are served out of the incremental
 * cache**, and with no cache configured there is nowhere to read them from. Statically-routed
 * pages like `/about` are fine — their route module is reached directly — but every `/zh/*` page
 * comes from `app/(marketing)/[locale]/…`, and all five returned 404 on the deployed Worker while
 * passing locally and in CI, because `next start` reads the cache off the filesystem and the
 * Worker cannot.
 *
 * That is worth remembering as a class of bug: **Playwright against `next start` cannot see it.**
 * Only a request to the real deployment can, which is exactly why the phase-02 verification list
 * asks for Lighthouse on the deployed preview rather than on localhost.
 *
 * `staticAssetsIncrementalCache` is the right implementation here rather than the R2 or KV ones:
 * it reads prerendered pages straight from the Workers static-assets binding we already have, so
 * it needs no additional Cloudflare resource — which matters on the free plan and for per-PR
 * preview deploys. Its one limitation is that it cannot revalidate or write, and this site has
 * nothing to revalidate: every route is SSG. The moment a route needs ISR or on-demand
 * revalidation, this has to become the R2 cache with a bucket behind it.
 */
export default defineCloudflareConfig({ incrementalCache });
