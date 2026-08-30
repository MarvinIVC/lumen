# Working on Lumen

Read this first. It is the operating manual for any agent — Claude Code, Codex, or a human — and it
is deliberately short. Two companion documents carry the detail:

- **`../lumen-blueprint/`** — the product plan. Seven specs (`00-BRIEF` … `06-RENDER-EXPORT-SAFETY`)
  and eleven sequenced phase prompts in `prompts/`. The phase prompt is your brief; the specs are
  the contract it is written against.
- **`docs/PHASE-LOG.md`** — what every completed phase actually decided, and **what a later phase
  must not undo by accident**. Read the entries for the phases before yours. This is not optional
  background: several of them are load-bearing and invisible from the code.

`CONTRIBUTING.md` has the quality bar and the PR workflow. This file has the things that will
otherwise cost you an afternoon.

---

## The loop

One phase per pull request, branched from `main`.

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

Before opening a PR, run what CI runs:

```bash
pnpm typecheck && pnpm lint && pnpm format:check
pnpm test:unit          # ~333 tests, node
pnpm test:stories       # axe over every story, real browser
pnpm build && pnpm test:budget    # first-load JS ceiling on the marketing routes
pnpm cf:build && pnpm check:worker  # the real Worker answers every public URL
pnpm test:e2e           # Playwright, chromium + mobile-safari
pnpm lh && pnpm lh:mobile           # Lighthouse, desktop and emulated 4G
```

Two of those need a flag most people forget:

- **`NEXT_PUBLIC_DEV_SCREENS=1` must be set on `pnpm build`**, not just at test time. Without it the
  `/dev` design-harness routes compile out and ~33 Playwright tests fail against a production build.
- A stale `next start` will happily serve an old build while you read it as current.
  `lsof -ti:3000 | xargs kill -9` before trusting any local production check. `pkill -f "next start"`
  does not catch it.

## The rule that matters most

**A green pipeline is not evidence the deployment works.**

Phase-02 shipped a pull request where every check passed — 333 unit tests, 75 Playwright tests, six
Lighthouse runs — while all five `/zh/*` pages returned 404 in production. `next start` reads Next's
prerender cache off the filesystem; the Cloudflare Worker cannot, and nothing that talks to
`next start` can see the difference.

So: **check the deployed preview, not localhost.** Every PR gets one at
`https://pr-<n>-lumen.marvinmaiwang.workers.dev`.

```bash
node scripts/check-worker-routes.mjs --base=https://pr-<n>-lumen.marvinmaiwang.workers.dev
LH_BASE_URL=https://pr-<n>-lumen.marvinmaiwang.workers.dev pnpm lh:preview
```

`check:worker` also runs in CI against the real workerd runtime, which is the only check in the
pipeline that would have caught that bug.

## Hard limits, with numbers

| Limit                                 | Current                   | Enforced by                        |
| ------------------------------------- | ------------------------- | ---------------------------------- |
| Worker size (Cloudflare free plan)    | **3005 / 3072 KiB — 98%** | `wrangler deploy` refuses over     |
| First-load JS on `/`                  | 107.5 / 120 KB gz         | `pnpm test:budget`, in CI          |
| Lighthouse on `/` and `/how-it-works` | 100 / 100 / 100 / 100     | `pnpm lh`, `pnpm lh:mobile`, in CI |
| Monthly AI spend                      | ceiling ¥100              | `app_config` caps + kill switch    |

**The Worker ceiling is the one that will bite next.** There is 67 KiB of headroom and phase-03 adds
the app shell. `02-ARCHITECTURE.md` §8 names the two dead payloads inside it and the options.
Measure with `pnpm exec wrangler deploy --dry-run --outdir=/tmp/wr` — it prints the same gzipped
number the Cloudflare API enforces.

## Conventions that are enforced, not suggested

- **Design tokens only.** No hex, no arbitrary lengths in `components/**`, `lib/render/**`,
  `lib/design/**`. `tests/unit/tokens-only.test.ts` reads the files as text, because ESLint does not
  parse CSS.
- **The heavy renderers stay dynamic.** KaTeX, Mermaid, smiles-drawer and paged.js each have exactly
  one `await import()`. `tests/unit/dynamic-imports.test.ts` fails on a static one.
- **Every visible string comes from `messages/{en,zh}.json`.** Key and ICU-placeholder parity between
  locales is a unit test — a missing key renders as its own key path on a live page, silently.
- **Commit scopes** are limited to the list in `commitlint.config.mjs`.

## When you finish a phase

Append an entry to `docs/PHASE-LOG.md` in the same shape as the others — especially the
"must not undo" section. The next agent may be a different tool with no memory of this one.
