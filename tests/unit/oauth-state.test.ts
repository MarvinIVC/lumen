/**
 * The OAuth `state` parameter, across both runtimes (06 §3).
 *
 * One side mints and the other verifies: a Next route on the Cloudflare origin knows who the
 * student is, and the Supabase edge function that receives the callback does not. The string
 * between them is the only thing carrying that fact, and it is signed — so if the two
 * implementations ever disagree by a byte, every connection attempt fails with "state_invalid" and
 * nothing in either codebase looks wrong.
 *
 * So this mints in node and verifies in Deno, and then the other way round.
 */
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

import { mintState, verifyState } from '@/lib/integrations/oauth-state.server';

const SECRET = 'dGVzdC1zZWNyZXQtZm9yLXRoZS1zdGF0ZS1wYXJhbWV0ZXI=';
const STATE = { userId: 'user-123', provider: 'notion' as const, next: '/app/settings' };

/**
 * Runs a snippet against the Deno implementation, with the same secret.
 *
 * Deno is already a prerequisite for this repository — `pnpm check:edge` is in the loop and cannot
 * run without it — but an `ENOENT` from `spawnSync` is an unhelpful way to be told that, so it is
 * said plainly instead.
 */
function deno(snippet: string): string {
  try {
    execFileSync('deno', ['--version'], { stdio: 'ignore' });
  } catch {
    throw new Error(
      'This test needs Deno, because it proves the node and Deno halves of the OAuth state ' +
        'format agree. Install it (https://deno.land) — `pnpm check:edge` needs it too.',
    );
  }

  return execFileSync(
    'deno',
    [
      'eval',
      '--quiet',
      `import { mintState, verifyState } from './supabase/functions/_shared/oauth-state.ts';\n${snippet}`,
    ],
    {
      encoding: 'utf8',
      env: { ...process.env, INTEGRATION_STATE_SECRET: SECRET },
      timeout: 60_000,
    },
  ).trim();
}

const withSecret = <T>(run: () => T): T => {
  const previous = process.env.INTEGRATION_STATE_SECRET;
  process.env.INTEGRATION_STATE_SECRET = SECRET;
  try {
    return run();
  } finally {
    if (previous === undefined) delete process.env.INTEGRATION_STATE_SECRET;
    else process.env.INTEGRATION_STATE_SECRET = previous;
  }
};

describe('the OAuth state parameter', () => {
  it('round-trips within node', () => {
    withSecret(() => {
      const minted = mintState(STATE);
      expect(verifyState(minted)).toEqual(STATE);
    });
  });

  it('refuses a tampered payload', () => {
    withSecret(() => {
      const minted = mintState(STATE);
      const [version, payload, signature] = minted.split('.');
      // Someone else's user id, with the original signature: the whole point of signing this.
      const forged = Buffer.from(
        JSON.stringify({ ...STATE, userId: 'someone-else', iat: Date.now() }),
        'utf8',
      ).toString('base64url');
      expect(verifyState(`${version}.${forged}.${signature}`)).toBeNull();
      expect(verifyState(`${version}.${payload}.${'0'.repeat(signature!.length)}`)).toBeNull();
    });
  });

  it('refuses one that has expired', () => {
    withSecret(() => {
      const minted = mintState(STATE, Date.now() - 11 * 60 * 1000);
      expect(verifyState(minted)).toBeNull();
    });
  });

  it('is verified in Deno exactly as node minted it', () => {
    const minted = withSecret(() => mintState(STATE));
    const output = deno(
      `console.log(JSON.stringify(await verifyState(${JSON.stringify(minted)})));`,
    );
    expect(JSON.parse(output)).toEqual(STATE);
  });

  it('is verified in node exactly as Deno minted it', () => {
    const minted = deno(`console.log(await mintState(${JSON.stringify(STATE)}));`);
    withSecret(() => {
      expect(verifyState(minted)).toEqual(STATE);
    });
  });

  it('rejects in Deno what node rejects', () => {
    const minted = withSecret(() => mintState(STATE));
    const tampered = `${minted.slice(0, -1)}${minted.endsWith('a') ? 'b' : 'a'}`;
    const output = deno(
      `console.log(JSON.stringify(await verifyState(${JSON.stringify(tampered)})));`,
    );
    expect(JSON.parse(output)).toBeNull();
  });
});
