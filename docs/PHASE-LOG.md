# Phase log

What each completed phase decided, and what a later phase must not undo by accident.

The phase prompts in `../lumen-blueprint/prompts/` say what to build. This says what happened when
it was built — the decisions that are not derivable from the code, the reversals, and the traps that
cost someone a day. **Read the entries for every phase before yours.**

Append an entry when you finish a phase. Keep the "must not undo" section honest: it is the part
that is read.

---

## Phase 00 — Scaffold, tooling, deploy pipeline

Shipped 2026-08-28. Live at <https://lumen.marvinmaiwang.workers.dev>.

**Must not undo**

1. **`--text-faint` and light-theme `--warning` are marker tokens, never prose.** They measure
   3.07:1 and 3.72:1 — under the 4.5:1 body-copy bar. The token _values_ are exactly as
   `03-DESIGN.md` §2 specifies; only their documented role changed. Use `--text-muted` for small
   text. `tests/unit/contrast.test.ts` enforces this per token.
2. **DeepSeek pricing is ~4.7× the blueprint's assumption on output** (peak $0.44/M in-miss,
   $1.32/M out — not $0.14/$0.28). `app_config.pricing` stores peak/off-peak and hit/miss rate cards
   in CNY at USD/CNY 6.72. The spec's vision model id `deepseek-vision-exp` is not real; it is
   `deepseek-v4-flash-vision-exp`. Output tokens are ~86% of cost, so `limits.max_tokens` per mode
   matters far more than prefix caching.
3. **The cost ceiling is `monthly_cap_cny` (100), not the daily cap.** `daily_cap_cny` is 6 and is
   only a burst guard. A daily-only cap trips during exam-week bursts — exactly when students need
   the product most.
4. **The Cloudflare target is Workers, not Pages** (`@opennextjs/cloudflare` v1; the Pages adapter is
   deprecated). TypeScript is pinned to 5.9.3 because `typescript-eslint@8` caps at `<6.1.0`.

**Gotcha** — never run `supabase start` and `supabase functions serve` concurrently. They race over
the edge-runtime container and wedge it in Docker's `removing` state, which only a daemon restart
clears.

---

## Phase 01 — Design system & notes renderer

Shipped 2026-08-29 (PR #1). The first green CI run this repo ever had.

**Must not undo**

1. **Tailwind v4 dropped `[--token]`; it must be `(--token)`.** `duration-[--dur-fast]` compiles to
   `transition-duration: --dur-fast` — invalid, silent, and nothing lints it.
2. **`notes.css` is unlayered, so it beats `@layer utilities`.** Any element rule there silently
   overrides a Tailwind utility on the same element. `.lumen-diagram svg` uses `!important`
   deliberately, to beat Mermaid's inline `max-width`.
3. **`overflow-x: auto` makes the _other_ axis scrollable too**, and KaTeX display maths overhangs
   its line box — so every equation was a keyboard-unreachable scroll region. Display maths carries
   `py-2` for this. `useScrollableRegion` writes attributes straight to the DOM rather than through
   React state, so nothing can observe the element mid-update.
4. **A label of rendered maths has no accessible name.** KaTeX's MathML is inside the element and
   name-from-contents will not reach it. Use `toSpokenText()` from `lib/render/markdown/inline`.
5. **Reading-mode and options toggles are `SegmentedControl` (a radiogroup), not Radix Tabs.** Tabs
   without panels ship a dangling `aria-controls` that axe fails.
6. **Two deliberate spec reconciliations, both in `lib/ai/schema.ts`.** `ChartSpec` follows `06` §1 —
   `bars | line | steps | composition`, with `illustrative` on each — replacing phase-00's
   disagreeing shape; and `NoteDocument.furtherStudy?: string[]` was added because `06` §1 has the
   renderer draw "Study next" last and phase-00 gave it no field. **Phase-04 must emit these
   shapes.**

**Guardrails added** — `tests/unit/tokens-only.test.ts` (no hex or arbitrary lengths in the design
trees) and `tests/unit/dynamic-imports.test.ts` (katex / mermaid / smiles-drawer / pagedjs must be
dynamic, one loader each).

**Gotchas** — paged.js fills its margin boxes with a CSS `content:` pseudo-element, so `textContent`
and Playwright's `toContainText` see an empty page while the running header is on screen; read the
computed `content`. `test.use({ reducedMotion })` is silently overridden by the device preset in
`playwright.config.ts` — use `page.emulateMedia`. Radix selects a radio on arrow navigation via a
flag held between keydown and keyup, which Playwright's instantaneous `press` loses — use Space.

---

## Phase 02 — Marketing site & interactive demo

Shipped 2026-08-30 (PR #2). Five routes × two locales, all SSG. Production verified: every public
URL correct on the real Worker, Lighthouse 100/100/100/100 on `/` and `/how-it-works`, desktop and
emulated 4G.

**Three bugs that only the deployed check could find** — see `AGENTS.md`, "the rule that matters
most". Summarised: every `/zh/*` page 404'd in production because no incremental cache was
configured and `populateCache` never ran; `next/og` put 1.4 MB of WebAssembly in the Worker and broke
the 3 MiB deploy ceiling; and `instrumentation.ts` statically imported the Sentry Node SDK, so it
shipped with monitoring off.

**Must not undo**

1. **Routing has no middleware and rests on one Next behaviour.** English serves from the bare path
   (`app/(marketing)/(en)/…`), other locales from `app/(marketing)/[locale]/…` with
   `dynamicParams = false`. `/about` matches _both_ the static segment and `[locale]` with
   `locale="about"`; Next prefers the static one. `tests/e2e/marketing.spec.ts` asserts it. If it
   ever breaks, the fallback is a literal `zh/` folder.
2. **Prerendered pages of dynamic routes need an incremental cache.** `open-next.config.ts` uses
   `staticAssetsIncrementalCache` — no R2 or KV needed, but it **cannot revalidate or write**. The
   first route that needs ISR or on-demand revalidation must move this to the R2 cache with a bucket
   behind it. `populateCache` is folded into `pnpm cf:build`; do not unpick that.
3. **next-intl is server-only, deliberately.** `getTranslations({ locale })`, no
   `NextIntlClientProvider`, no `next-intl/navigation` — i18n costs zero client bytes. Client islands
   take strings as props, and **a function cannot cross that boundary**, which is why the hero
   scrubber receives a `valueTemplate` string it substitutes itself.
4. **Newsreader dropped its `opsz` axis** (129 KB → 58 KB) and **only the serif is preloaded.** This
   reverses a phase-01 decision on purpose: the headline is the LCP element on every public route and
   the axis cost 1.2 s of emulated-4G LCP. `font-optical-sizing: auto` in `notes.css` is now inert
   and says so. `font-display: optional` would close the last gap and was rejected — it shows
   first-time visitors on a slow connection the whole landing page in Georgia.
5. **Everything expensive on `/` is reachable through exactly one module**,
   `lib/marketing/sections/lazy-sections.tsx`. One static import of the renderer, the fixture, KaTeX,
   Mermaid or smiles-drawer anywhere upstream blows the budget. `pnpm test:budget` notices.
6. **Class maps were extracted so server components can reuse them without a client boundary:**
   `components/ui/button-styles.ts` (`buttonClass()`), `lib/render/provenance-styles.ts`, and
   `lib/render/markdown/strip.ts` — `stripInline` moved out of `inline.tsx`, which imports
   `InlineMath` and would otherwise drag the maths loader into any server component's graph.
7. **Tailwind's `@layer utilities` beats `marketing.css`'s `@layer components`.** A `display: none`
   there lost to an `inline-flex` utility on the same element. Switch visibility with paired
   responsive utilities (`sm:hidden` / `max-sm:hidden`), not with a rule in the CSS file.
8. **The quoted notes are enforced, not trusted.** `lib/marketing/excerpts.ts` slices the hero's
   messy panel out of the fixture at build time, and `tests/unit/marketing-excerpts.test.ts` asserts
   every quoted line in both catalogues is a verbatim substring of `fixtures/ap-chem-u1-raw.md`. The
   page says "nothing is invented" — do not edit those strings to read better.
9. **`generateMetadata` returning `openGraph` replaces a file-based `opengraph-image`.** Every other
   OG tag stays correct and the image silently vanishes. Moot now that the card is a committed
   `public/og.png` (`pnpm og:build`), but the trap remains for any future metadata image file.
10. **Lighthouse's `is-crawlable` audit always fails on a preview alias** — Cloudflare stamps
    `x-robots-tag: noindex` on `pr-N-*` URLs, and production carries no such header.
    `lighthouse-targets.cjs` disables that one audit for preview origins only.

**Left undone, on purpose**

- Cloudflare serves content-hashed assets with `cache-control: public, max-age=0, must-revalidate`.
  Hashed filenames should be `immutable, max-age=31536000`; as it stands every asset costs a
  revalidation round trip. It did not move the Lighthouse scores, so it was not added to an already
  green PR. Good first task for phase-09.
- The Worker sits at 98% of its ceiling. See `AGENTS.md` and `02-ARCHITECTURE.md` §8.

**Gotchas** — `gh run list --branch main` hands you the _previous_ merge's runs if you sample before
the new ones exist; wait on a specific run id. Playwright's `page.mouse` works in viewport
coordinates while `boundingBox()` happily returns a rectangle for an element below the fold —
`scrollIntoViewIfNeeded()` before any drag. `pnpm add` can leave `'set this to true or false'`
placeholders in `pnpm-workspace.yaml` that break every later `pnpm install`.
