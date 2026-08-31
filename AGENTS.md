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
pnpm test:unit          # ~523 tests, node
pnpm test:ai            # the eval suite — the release gate for any prompt change
pnpm test:stories       # axe over every story, real browser
pnpm build && pnpm test:budget    # first-load JS ceiling on the marketing routes
pnpm cf:build && pnpm check:worker  # the real Worker answers every public URL
pnpm test:e2e           # Playwright, chromium + mobile-safari
pnpm lh && pnpm lh:mobile           # Lighthouse, desktop and emulated 4G
```

The edge functions have their own two checks, because `tsc` cannot see them (it excludes
`supabase/functions`, which needs the Deno globals) and neither can Playwright:

```bash
pnpm check:edge         # deno check — `tsc` cannot see these files

pnpm db:start
pnpm exec supabase db reset
pnpm exec supabase functions serve --no-verify-jwt --env-file supabase/functions/.env.test &
pnpm test:edge          # 32 guardrail checks against the real functions, no spend
```

`test:edge` drives the deployed shape of `enhance` — real auth, real quota reads, real ledger
writes, real SSE — until it refuses, against a scripted provider that lives inside the same
runtime. It is the only check that can prove the cost ceiling is enforced rather than described.

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
| Worker size (Cloudflare free plan)    | **1731 / 3072 KiB — 56%** | `wrangler deploy` refuses over     |
| First-load JS on `/`                  | 107.5 / 120 KB gz         | `pnpm test:budget`, in CI          |
| Lighthouse on `/` and `/how-it-works` | 100 / 100 / 100 / 100     | `pnpm lh`, `pnpm lh:mobile`, in CI |
| Monthly AI spend                      | ceiling ¥100              | `app_config` caps + kill switch    |
| Measured cost per enhancement         | ¥0.047 median, ¥0.071 max | `pnpm test:ai`, fails at +25%      |

**The Worker ceiling bit in phase-03 and was fixed, not deferred.** Adding the parsers took it to
3742 KiB — over the ceiling and undeployable. `next.config.ts` now aliases the seven browser-only
libraries (pdf.js, mammoth, heic2any, mermaid, katex, smiles-drawer, paged.js) to `false` in the
_server_ compilation: none of them can execute there, but Next compiles client components for the
SSR pass, so webpack was emitting all of them into `.next/server` for OpenNext to bundle. That is
2.2 MB of unreachable JavaScript, and removing the alias list puts the deploy back over the limit.
Measure with `pnpm exec wrangler deploy --dry-run --outdir=/tmp/wr` — it prints the same gzipped
number the Cloudflare API enforces.

## Conventions that are enforced, not suggested

- **Design tokens only.** No hex, no arbitrary lengths in `components/**`, `lib/render/**`,
  `lib/design/**`. `tests/unit/tokens-only.test.ts` reads the files as text, because ESLint does not
  parse CSS.
- **The heavy renderers and the parsers stay dynamic.** KaTeX, Mermaid, smiles-drawer, paged.js,
  mammoth, pdf.js and heic2any each have exactly one `await import()`, in one loader module.
  `tests/unit/dynamic-imports.test.ts` fails on a static one.
- **Every visible string comes from `messages/{en,zh}.json`.** Key and ICU-placeholder parity between
  locales is a unit test — a missing key renders as its own key path on a live page, silently.
  One scoped exception, decided with the user in phase-03 and recorded in the phase log:
  `/app/*` copy lives in `lib/app/strings.ts`, because next-intl is server-only by phase-02's
  design and the workspace is almost entirely client components. That module is the whole
  exception; do not start a second one.
- **Commit scopes** are limited to the list in `commitlint.config.mjs`.
- **Prompts are versioned.** Any edit to a string in `lib/ai/prompts/` bumps `PROMPT_VERSION`,
  re-runs `pnpm test:ai` and updates the hash in `tests/unit/prompt-cache.test.ts` — which fails on
  every prompt edit on purpose. See `docs/PROMPTS.md`.
- **The cached prefix is byte-identical or it is not cached.** Nothing above the run instruction
  may vary per call: no clock, no id, no title. A regression there is invisible in the output and
  costs ~31x on input.
- **`lib/ai/**` is imported by the Deno edge functions as well as by Next**, so its relative
  imports carry an explicit `.ts` extension and it may not touch a Node or DOM API. Provider code
  lives in `lib/ai/providers/`, which no client module may import.

## When you finish a phase

A phase is **not** finished when CI is green. It is finished when the preview has been verified,
the pull request is **merged**, `main` is green, and production is checked — so the next phase can
start without going back. That is the standing definition of done for this project, set after
phase-03, where CI passed, the local Playwright suite passed against a production build, and the run
against the preview still found a bug that would have silently discarded a student's answer.

Merge it yourself. Do not stop at "ready to merge" for a confirmation; the phase is not done until
`main` is green and production serves it.

So, in order:

1. Run everything in "The loop" above.
2. Push the branch and open the PR. Wait for CI and Deploy on **that commit** — `gh run list` will
   hand you the previous merge's runs if you sample too early.
3. Verify the preview at `https://pr-<n>-lumen.marvinmaiwang.workers.dev`, and not only with
   `check:worker`:

   ```bash
   node scripts/check-worker-routes.mjs --base=https://pr-<n>-lumen.marvinmaiwang.workers.dev
   PLAYWRIGHT_BASE_URL=https://pr-<n>-lumen.marvinmaiwang.workers.dev pnpm exec playwright test tests/e2e/<your-suite>.spec.ts
   LH_BASE_URL=https://pr-<n>-lumen.marvinmaiwang.workers.dev pnpm lh:preview
   ```

   Point the phase's own end-to-end suite at the deployment. That is the step that has now caught
   two production-only bugs in three phases, and neither was visible from anything else.
   The `/dev` specs are the exception — the deploy workflow does not set `NEXT_PUBLIC_DEV_SCREENS`,
   deliberately, so they will 404 against a preview.

4. Merge (rebase, delete the branch), then **watch `main`'s own CI and Deploy on the merge
   commit** — `gh run list --branch main` will hand you the _previous_ merge's runs if you sample
   before the new ones exist, so match on the head SHA. Phase-03 went red on `main` having been
   green on the branch: a test that built its own five-megabyte fixture could not build it in time
   on a two-core runner.
5. Check production the same way you checked the preview:

   ```bash
   node scripts/check-worker-routes.mjs --base=https://lumen.marvinmaiwang.workers.dev
   PLAYWRIGHT_BASE_URL=https://lumen.marvinmaiwang.workers.dev pnpm exec playwright test tests/e2e/<your-suite>.spec.ts
   ```

6. Append an entry to `docs/PHASE-LOG.md` in the same shape as the others — especially the
   "must not undo" section. The next agent may be a different tool with no memory of this one.
