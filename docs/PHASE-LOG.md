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

---

## Phase 03 — Ingestion: upload, parse, review

Shipped 2026-08-30. `/app`, `/app/new`, `/app/review` and `/app/note/:id` are live behind the
marketing CTA that has pointed at `/app/new` since phase-02. Everything in this phase is
client-side and free: **no AI spend, and the only network call the whole flow can make is
Turnstile.**

The Worker went **3005 → 3742 KiB gz** the moment the parsers landed, over the 3072 KiB free-plan
ceiling, exactly as `02-ARCHITECTURE.md` §8 predicted. It now sits at **1731 KiB — 56%** of the
limit, with more headroom than phase-02 had. See "must not undo" #1.

**Must not undo**

1. **`next.config.ts` aliases seven browser-only libraries to `false` in the _server_
   compilation.** pdf.js, mammoth, heic2any, mermaid, katex, smiles-drawer and paged.js can none of
   them execute on the server — every one is behind a single `await import()` in a client module,
   called from an effect or an event handler. But Next compiles client components for the SSR pass
   too, so webpack followed those dynamic imports and emitted the chunks into `.next/server`, where
   OpenNext bundled them into the Worker: 2.2 MB of raw JavaScript that cannot run, in the tightest
   budget in the project. Removing the alias list puts the deploy back over the ceiling. If one of
   them ever genuinely needs to run server-side, take that one off the list rather than working
   around it, and re-measure with `pnpm exec wrangler deploy --dry-run --outdir=…`.
   **`config.webpack` is ignored under Turbopack** — moving `next build` to Turbopack means finding
   the equivalent, or the Worker silently grows past the ceiling again.
2. **The parsers are reachable through exactly one loader**, `lib/ingest/loaders.ts`, the same rule
   phase-01 set for the renderers. `tests/unit/dynamic-imports.test.ts` now covers `mammoth`,
   `pdfjs-dist` and `heic2any` as well. One static import of any of them undoes both the client
   code-splitting and, with #1, the Worker budget.
3. **A canvas-produced `Blob` cannot be stored in IndexedDB on WebKit** — "Error preparing
   Blob/File data to be stored in object store". `StoredAsset` holds an `ArrayBuffer` and the Blob
   is rebuilt on read. On an iPhone this bug made every photo upload hang on "Reading…" for ever.
4. **A browser asked for an image format it cannot encode returns PNG rather than failing.** Safari
   has no WebP encoder, so the downscale handed back a **9.9 MB** file for a 5 MB iPhone photo —
   the step that exists to cut the upload nearly doubled it, on exactly the devices that take the
   photos. `canvasToBlob` checks the returned blob's own `type` and re-encodes as JPEG.
5. **An unexpected parser failure must never rethrow out of the parse loop.** It stopped the batch
   and left the file's row reading for ever, which is the worst failure mode on this screen. The
   loop marks the row with 01-PRODUCT.md §5's copy and reports the real error out of band
   (`reportUnexpected`), so Sentry still sees it and the student never sees a stack trace.
6. **The draft id lives in the URL (`?d=`)**, not in local storage. That single decision is the
   whole of "refresh at any point and lose nothing": a reload re-reads the same record, the back
   button works, and a second tab is a second draft rather than a silent fight over one.
7. **`/app` strings live in `lib/app/strings.ts`, not in `messages/{en,zh}.json`.** A deliberate,
   scoped exception to the rule in `AGENTS.md`, decided with the user: next-intl is server-only by
   phase-02's design and `/app` is almost entirely client components whose copy is composed at
   runtime from parse results. The exception is that one module, English is the only locale `/app`
   claims, and moving it into the catalogues is one file's work.
8. **Detection is local and synchronous, and the model classify is wired but off.**
   `lib/curriculum/detect.ts` is a real implementation now, not the phase-00 declarations. On the
   fixture it returns Chemistry / AP / AP Chemistry / Unit 1 / en at **0.875 confidence**, over
   `04-AI-ENGINE.md` §3's 0.7 bar — so the classify call never fires for the common case, which is
   the entire economic argument for having a local pass. `lib/ai/detect-client.ts` and
   `lib/ai/ocr-client.ts` report themselves unavailable until phase-04 deploys those functions;
   both fall back to something a student can still use rather than to an error.
9. **Language detection is hand-rolled (~2 KB), not `franc`/`tinyld`.** `04-AI-ENGINE.md` §3 names
   those; the smallest is ~200 KB for one field the student can override with one control, and it
   only has to be right about the two languages this product renders. Script ranges settle CJK,
   Cyrillic, Arabic, Devanagari, Hangul, Greek, Hebrew and Thai; a stopword vote settles the
   Latin-script languages. **The script check runs before the length floor** — 60 characters of
   English is a fragment while 60 characters of Chinese is two sentences, and one floor for both
   returned "unknown" for a page of Chinese notes with the script in plain sight.
10. **The soft quality warning fires on one signal, not two.** `essay-prose` or `code` alone is
    enough; `no-structure` and `very-short` never are. Requiring two sounded cautious and was
    simply wrong — a three-paragraph history essay, the exact case the gate exists to catch,
    produces one signal. It always allows proceeding: the server refusal in phase-04 is the real
    gate (02-ARCHITECTURE.md §7 layer 3).
11. **`putAssets` never rejects.** Thumbnails are a convenience — the review screen shows a picture
    where it has one and the OCR button where it does not — and a storage failure must not be able
    to fail the parse that produced them. Safari in private browsing refuses IndexedDB outright,
    and that is not a reason to tell a student their photo could not be read.
12. **Detection must never overwrite what the student typed, and the check has to come _after_ the
    awaits.** Everything in `runDetection` before the final `patch` can wait on the network — the
    pack manifest is a chunk, the classify call in phase-04 is a request — while the student is
    looking at an editable form. On the deployed preview that window was long enough to land on
    their first keystroke: they set the unit, the awaited detection resolved behind them, their
    answer was replaced by the guess _and_ marked unedited, and a reload showed an empty field.
    Locally the chunk import is instant and the window is nothing, **which is why only the run
    against the real Worker found it** — the third time this project has been taught that lesson.
    `tests/unit/draft-store.test.ts` now holds it open deliberately.
13. **`useDraft` only rewrites the URL while its own screen is still mounted.** During a
    navigation away, `useSearchParams` reads as empty for a moment before the route changes, which
    looked exactly like "the URL has lost its draft id" — so the effect replaced it and cancelled
    the navigation the student had just started. The guard is `pathname !== basePath`.
14. **`splitLesson` copies the assets, it does not share them.** The tail's blocks still point at
    asset ids filed under the draft they were split from, so without the copy the second lesson
    opened with every scanned page missing — and discarding the first draft would have deleted the
    rows the second one needed.
15. **A pre-2007 `.doc` is not a locked file, even though it looks like one.** Both are CFB
    containers, so both were reported as `encrypted` — which opened a password dialog that could
    never have worked, because nothing here decrypts Word. `legacy-format` is its own code now, and
    only `encrypted` offers a password box. Found by walking the §5 states rather than reading them.
16. **`Textarea` takes `ComponentPropsWithRef<'textarea'>`.** The review screen's blocks measure
    `scrollHeight` to size themselves. Estimating the height from the character count was the first
    attempt and was wrong in both directions: a two-row floor made a pane of thirty one-line
    definitions a minute of scrolling, and any estimate at all clipped the fixture's mercury
    calculation — the one block on that page a student most needs to see whole.

**Decisions taken in-session** (the user was asked; do not re-litigate)

- **App strings: English-only in one module.** See #7.
- **Language detection: hand-rolled.** See #9.
- **The extraction editor is one textarea per block, not a contenteditable surface.** Cross-block
  editing is worse; keyboard behaviour, screen-reader announcement, Chinese input, paste handling
  and dropping an OCR result in as a new block are all better. Phase-06 brings TipTap for the
  finished document, where rich editing is the point; here the job is corrections.

**Two things scoped honestly rather than claimed**

- **"Works fully offline" means parsing has no network dependency**, which
  `tests/e2e/ingest.spec.ts` proves with the network cut. A cold navigation between `/app` routes
  still needs the network, because `public/sw.js` deliberately caches nothing until phase-09. That
  is the offline app shell and it is phase-09's to build.
- **OCR and the model classify are buttons that say when they will work**, not buttons that lie.
  Both edge functions are phase-04's. Both call sites are wired end to end — `ocr()` in
  `review-screen.tsx` fetches the asset, calls `runOcr` and drops the result in as an editable
  block — so phase-04 deploys the function and flips one flag.
- **`QuotaMeter` on the review screen is hardcoded to 0 of 3.** That is the anon tier from
  `app_config.quota` and it is accurate while nothing has been spent, which is every session in
  this phase. Phase-04 owns the real counter; the component is not a shell, the number behind it
  is.

**New in this phase** — `lib/ingest/*` (parsers, normaliser, caps, quality gate, cost estimate),
`lib/store/*` (IndexedDB drafts, assets, notes, the Zustand workspace store), `lib/app/*` (routes,
strings, suggestions, screens), `components/domain/context-editor.tsx`,
`components/domain/turnstile-widget.tsx`, and two generated fixtures
(`pnpm fixtures:ingest` → `fixtures/ap-chem-u1-raw.docx`, `fixtures/scanned-worksheet.pdf`).
`pnpm shoot:app` drives the real flow and screenshots it at two widths in both themes — these
screens cannot be captured by navigating to a URL, because there is nothing on them until files
have been read.

**Every `01-PRODUCT.md` §5 ingestion/review row is walked by a test**, not asserted about from the
outside — which needed three fixtures that did not exist: a 45-page and a 61-page scan for either
side of the soft and hard page caps, and a **genuinely encrypted PDF** so the password dialog is
exercised end to end (wrong password, then right one, then parsed). `pnpm fixtures:ingest` writes
them; the RC4 and the PDF standard security handler are ~60 lines in
`scripts/build-ingest-fixtures.mjs`, written out because Node's crypto dropped RC4 and rightly so.
That file encrypts a test fixture and nothing else.

**New guard** — `pnpm check:worker:size` runs `wrangler deploy --dry-run` and fails over the
3072 KiB ceiling. It is in CI right after `cf:build`. Nothing in the pipeline measured this before,
which is how a pull request could go fully green and still be undeployable.

**The deployed check earned its keep again.** CI was green and the local Playwright suite passed on
a production build; the same suite pointed at `https://pr-4-lumen.…workers.dev` failed one test, and
it was a real bug that would have lost a student's answer (#12). Run it that way:
`PLAYWRIGHT_BASE_URL=<preview> pnpm exec playwright test tests/e2e/ingest.spec.ts`. Note the `/dev`
specs cannot be run against a preview — the deploy workflow does not set `NEXT_PUBLIC_DEV_SCREENS`,
by design.

**Gotchas**

- **`pnpm check:worker` now covers `/app/*`.** `/app/note/[id]` is the first route in this project
  that is server-rendered on demand rather than prerendered.
- **Playwright loads specs as CommonJS here**, so `import.meta.dirname` is not available in
  `tests/e2e`. Use `process.cwd()`.
- **WebKit only tabs to buttons when macOS "Full Keyboard Access" is on**, which Playwright does not
  set. Assert focus reveal and operation everywhere; assert tab traversal on Chromium.
- **Playwright hands WebKit an uploaded file through the browser process**, and reading it while the
  context is offline fails with "The I/O read operation failed". A real iPhone reading a file off
  its own disk does not.
- **All of `/app` is server-rendered markup before it is interactive**, so under `next dev` with
  nine parallel workers a `fill()` can be lost to a component that has not hydrated. `openNew()` in
  the ingest suite waits for the client to arrive first.
