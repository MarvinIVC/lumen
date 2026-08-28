import { defineCloudflareConfig } from '@opennextjs/cloudflare';

/**
 * OpenNext adapter config (02-ARCHITECTURE.md §2).
 *
 * Deliberately bare in phase-00: no incremental cache, no tag cache, no queue. The app is
 * static-first and the only long-running work happens in Supabase edge functions, so there is
 * nothing here to cache yet. Phase-02 revisits this once the marketing routes exist.
 */
export default defineCloudflareConfig();
