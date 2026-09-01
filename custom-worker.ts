// The OpenNext worker is generated immediately before Wrangler bundles this wrapper.
import openNextWorker from './.open-next/worker.js';

interface KeepaliveEnv {
  SUPABASE_URL?: string;
  KEEPALIVE_SECRET?: string;
}

interface WorkerContext {
  waitUntil(promise: Promise<unknown>): void;
}

const worker = {
  fetch: openNextWorker.fetch,
  async scheduled(_event: unknown, env: KeepaliveEnv, context: WorkerContext): Promise<void> {
    if (!env.SUPABASE_URL || !env.KEEPALIVE_SECRET) {
      throw new Error('SUPABASE_URL and KEEPALIVE_SECRET are required for the weekly keep-alive.');
    }
    context.waitUntil(
      fetch(`${env.SUPABASE_URL}/functions/v1/cron-keepalive`, {
        headers: { 'x-keepalive-secret': env.KEEPALIVE_SECRET },
      }).then(async (response) => {
        if (!response.ok) throw new Error(`Supabase keep-alive failed: ${response.status}`);
      }),
    );
  },
};

export default worker;
