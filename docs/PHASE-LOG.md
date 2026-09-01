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

- **A test that builds its own fixture has to be cheap to build.** The 5 MB-photo test painted 1.3
  million 3-pixel rectangles, which took **15 s on a throttled CPU** and was the one thing that
  failed on `main` after the merge, having passed on the branch, on the preview and locally.
  Scaling a small sheet of random pixels up with `imageSmoothingEnabled = false` gives the same
  blocky noise and the same file size for a couple of operations. Worth recording that the _product_
  was never the slow part: parsing and downscaling a 12-megapixel photo takes 1.6 s at 4× throttle
  and 2.1 s at 6×. Measure before optimising the wrong thing. (`crypto.getRandomValues` also
  refuses more than 64 KiB per call.)
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

---

## Phase 04 — The AI engine & generation flow

Shipped 2026-08-30. The engine: providers, prompts, the guardrails, the edge functions, the
streaming client, BYOK, and the eval suite that gates prompt changes.

**Live pricing re-verified on 2026-08-30** against `api-docs.deepseek.com`: flash $0.22/$0.44
cache-miss in, $0.007/$0.014 cache-hit in, $0.66/$1.32 out (off-peak/peak); pro at 3×; peak
01:00–04:00 and 06:00–10:00 UTC Mon–Fri. Identical to what phase-00 seeded, so `app_config` was
not touched — `tests/unit/pricing.test.ts` now asserts the row against those numbers, and the
nightly workflow runs it after the live evals so a price change is a red build rather than a
surprise at month end.

**Must not undo**

1. **The cached prefix is byte-identical or it is not cached.** `system` + the pack block + the
   domain block are `buildEnhancePrompt`'s stable half, and nothing in them may vary per call — no
   clock, no id, no title, no filename. DeepSeek's prefix caching is automatic and silent: when it
   stops, the output is identical and input costs ~31× more. `tests/unit/prompt-cache.test.ts` is
   the only thing that would notice.
2. **`lib/ai/**` is shared source with the Deno edge functions.** Deno resolves specifiers
   literally, so every relative import there carries an explicit `.ts` and `tsconfig` sets
   `allowImportingTsExtensions`. `sloppy-imports` in `supabase/functions/deno.json` is **not**
   honoured by the Supabase edge runtime — it was tried and it boots with `Module not found`. The
   alternative was a bundling step, which would have put a generated copy of the engine between the
   eval gate and the code students actually run. Nothing in `lib/ai` may touch a Node or DOM API.
3. **Packs reach the server through `lib/curriculum/registry.ts`, not `loadPack`.** A
   template-literal dynamic `import()` of JSON cannot be statically resolved by Deno, so the edge
   function would boot with no packs at all and silently generate in generic mode. The registry is
   static imports with the JSON import attribute. It must never be imported from client code.
4. **`daily_cost.cost_cny` is `numeric(12,5)`, not `(10,2)`.** `record_usage` adds each call's cost
   to a running total, so at two decimal places every ~0.007 CNY call rounded to 0.01 before it was
   added — a 40% overstatement, and at 4,000 calls a month a large fraction of the ceiling the cap
   exists to defend.
5. **A failed, refused or cancelled generation writes `credits: 0` and its real `cost_cny`.** The
   ledger has to stay honest about what was spent while the student's allowance stays untouched.
   `scripts/test-edge.mjs` asserts both halves for all three cases.
6. **An unreadable response is never a quota card.** `RefusalReason` is a closed union and the
   client maps anything outside it to `unavailable`. It was `| string` for an afternoon, and a 503
   from an unreachable backend rendered as "that is all the free study guides for today" — a
   message that is wrong about the student's own account and that they cannot check.
7. **`ALLOW_TEST_PROVIDER` gates `supabase/functions/test-provider`, and the deploy workflow names
   the functions it ships.** Two independent reasons the scripted provider cannot reach production.

**Decisions made in-session**

- **BYOK is a server-sealed blob held on the device.** `02` §6 puts the ciphertext in
  `profile.byok`, which needs an account, and accounts are phase-06 — but the DoD requires BYOK to
  work when the cap is hit. So the key is posted once to `byok`, validated with a one-token call,
  encrypted, and only the ciphertext comes back to `localStorage`. Same property that matters: only
  this server can open it. Phase-06 moves the same blob into `profile.byok` with nobody re-typing
  anything.
- **AES-256-GCM, not libsodium secretbox.** Same key material (32 bytes, `openssl rand -base64 32`),
  same strength, and no npm WebAssembly module in the one path where a load failure locks a student
  out of their own key. The ciphertext carries a `v1.` tag so a later move can read what this wrote.
- **The pack block is topic-scoped.** `05` §2 asks for a block under ~1200 tokens and `05` §3
  specifies AP Chem Unit 1 with eight detailed topics, which is ~2,150 on its own. Truncating a
  syllabus to hit a token target is the wrong resolution, so the topics the lesson is about get the
  full treatment (~1,400 tokens) and the rest of the unit appears as a one-line index. A lesson that
  names no topic still gets the whole unit.
- **The tolerant JSON parser is hand-rolled**, like phase-03's language detection: ~200 lines, no
  dependency, and it has to run in Deno as well as the browser.
- **The validator is hand-rolled too, not Zod.** The interesting rules are not shape checks, the
  repair path mutates as it goes, and a dependency-free module runs identically in Node, Deno and
  the browser.
- **Generation starts once per note and marks it `generating` before the request leaves.** A reload
  mid-call finds `generating` and _offers_ to resume rather than spending a second credit.
- **One Supabase project, so a pull request's edge functions are the live ones.** Recorded in
  `deploy.yml`. The mitigation is that the guardrails are config: `enhance_enabled` and both caps
  are rows, so a bad deploy is stopped from the dashboard in seconds.

**Two rules that were wrong, both found by tests**

- **The mermaid linter counted every word inside a node label as a node**, so an ordinary six-box
  diagram was rejected as twenty-one and silently dropped from the note.
- **"A correction quotes text still marked `student`" is a repair, not a failure.** The
  hand-authored gold fixture trips the literal reading of `04` §5, because a correction often
  _qualifies_ the student's wording rather than replacing it. The block becomes `ai-clarified`,
  which is what provenance should have said in the first place.

**What is measured**

Median cost per call is **0.047 CNY** at peak rates and the AP Chemistry call is **0.071**, against
the ~0.075 that `02` §7 budgets. At that rate the 100 CNY monthly ceiling buys roughly 2,100
enhancements — comfortable against the realistic 2,000/month in §7, and about half the pessimistic
4,000. The caps hold the ceiling either way; per-student quota is the flex, exactly as the migration
comment says.

**Verified against the live model and the deployed preview.** All five verification steps in the
phase prompt were run against the hosted Supabase project and `pr-7-lumen.…workers.dev`:

| Check                                   | Result                                                                                                  |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `fixtures/ap-chem-u1-raw.md` end to end | every hard check and every AP Chem assertion passes; the LLM judge scores **5/5 on all six dimensions** |
| Prefix cache                            | **7,680 of ~14,000 input tokens served from cache**, `cacheHit: true`                                   |
| Cost per call                           | **0.062 CNY** on the deployed run, inside the ~0.075 that `02` §7 budgets                               |
| Latency                                 | 74 s server-side; the first section is on screen after **12 s**                                         |
| `daily_cap_cny` forced to 0.01          | shared call refused 429 `daily-cap`; BYOK produced a document at `cost_cny: 0`                          |
| `enhance_enabled` false                 | 503 `kill-switch`, instantly                                                                            |
| Refusal fixture                         | `refused` with a reason, `credits: 0`, cost still recorded                                              |
| Stop mid-stream                         | partial kept, labelled, resumable — quota unchanged at 3, then 2 after completing                       |

Every point of the definition of done was checked individually on the deployed output: C₅H₇N
completed to C₁₀H₁₄N₂ with an open question raised, "atomic mass = molar mass" corrected and marked
`ai-corrected`, all seven diatomics with the student's mnemonic verbatim in a `student` margin note,
a mass-spectrum figure, the mercury example with units and three significant figures, five
calculations verified, and 12 flashcards / 10 quiz items.

The `recorded/*.json` files are still hand-authored and say so in a `source` field. Replace them
with real captures now that live runs produce passing documents.

**Gotchas**

- **Playwright's WebKit does not apply `page.route` to these cross-origin `fetch` calls.** The
  requests go to whatever is really listening on the Supabase port — which on a developer's machine
  is the local stack, so a stubbed test silently passes against the _real_ scripted provider and
  reports a document nobody wrote. The streaming tests are Chromium-only and say why; the storage
  half, which is where WebKit has actually bitten this project, runs on both engines by seeding
  IndexedDB directly.
- **The pipeline stamps `context` and `options` onto the finished document.** The model is never
  asked for them, and the browser client used to be the only thing patching them in — so any other
  consumer got a document that crashes the renderer. Found by the first test to read one back out
  of IndexedDB.
- **A margin note is in the document but off screen below 1100px.** Assert `toBeAttached`, not
  `toBeVisible`, for anything in the margin column on the mobile project.
- **`supabase functions serve` skips directories starting with `_`.** Useful for `_shared`;
  confusing for ten minutes when a probe function returns "Function not found".
- **Postgres numerics arrive from PostgREST as strings**, and `"10" >= 6` is false. Every number in
  the guardrail snapshot is coerced on the way in; the cap it defends is why.
- **`app_config` is cached for 60 s inside each function.** `APP_CONFIG_TTL_MS=0` is how the
  integration tests change a cap and expect the next request to obey it.
- **Vitest loads `.env.local` into `process.env`.** The moment real keys existed, `pnpm test:ai`
  stopped replaying recordings and started running seven paid generations. Live now needs
  `EVAL_LIVE=1`; keys on disk are not consent to spend.
- **The Supabase CLI does not pick up a newly _added_ env key without restarting the whole stack.**
  Editing an existing one works; adding one and re-running `functions serve` does not, which looks
  exactly like your code ignoring the variable.
- **Playwright's `setOffline` does not abort an already-open streaming response**, so it cannot
  simulate a connection dropping mid-generation. The Stop button exercises the same client path and
  the dropped-stream case is covered by a stubbed stream that simply ends.
- **`gh secret set` from a script needs the guard at the boundary.** A `--dry-run` flag applied at
  the call sites pushed a set of dummy values into the real repository while printing "would push".

**What phase-05 inherits**

The note workspace is built on top of what the engine actually emits, and four of those facts are
measured rather than assumed — all from the deployed output, not the fixtures.

1. **Provenance is block-level. Nothing emits inline `spans`.** `lib/ai/schema.ts` has `InlineSpan`
   and `lib/render/blocks/paragraph.tsx` assembles a paragraph from `spans` when they are there —
   but the model never produces them, and neither does the gold fixture. Phase-05 §9 asks for
   accept/reject "per-span or block". Per-block works today; per-span needs either a rubric change
   (and a `PROMPT_VERSION` bump, and a re-run of the evals) or a decision that block-level is the
   product. Do not discover this while wiring the UI.

2. **`originalText` is populated, so rejecting a correction can restore the exact wording.**
   Every `ai-corrected` and `ai-clarified` block in the deployed run carried it, and every
   `corrections[]` entry carried `original`. Two caveats found in the same run: one student
   sentence was claimed by _two_ blocks (an `ai-clarified` and an `ai-corrected` sharing the same
   `originalText`), so "reject" must handle one original mapping to several blocks; and the
   student's own wording for a corrected block lives **only** in `originalText`, not in any
   `student` block. That means "My original" reading mode has to splice `originalText` back in, or
   the mercury calculation — which came back as one `ai-corrected` block — vanishes from the
   student's own view of their own notes.

3. **`enhance` has no `scope` parameter.** Phase-05 §10 ("regenerate this section") needs one. The
   credit side is already done: `creditsFor` in `lib/ai/router.ts` prices `kind: 'regen'` at 0.25
   and `usage_event.kind` accepts it. What is missing is the request field, a prompt that asks for
   one section's blocks rather than a document, and a validator path that accepts a fragment —
   `validateNoteDocument` requires a whole document today.

4. **"Ask about this" needs the non-JSON path.** Every provider takes `json: false` already
   (`supabase/functions/byok` uses it for the one-token key check), but `runEnhance` is JSON-only
   end to end. That call wants to be its own small function rather than a mode of the pipeline.

Also inherited: `migrateNoteDocument` in `lib/ai/validate.ts` is a version stamp and a stats
recompute — enough for 1.0.0, and the place version history has to grow. Section ids come back as
readable slugs (`s-1-1-moles`), which is what the outline rail and any TipTap mapping will want to
key on.

**Two things a later phase should look at**

1. **At 0.062 CNY per call, the 100 CNY monthly ceiling buys roughly 1,600 enhancements** — fine
   against `02` §7's realistic 2,000/month only because most students will not use their full
   allowance. If real usage approaches the pessimistic case, the per-tier quota is the flex, not
   the cap.
2. **Verify runs with reasoning off, like everything else.** It is the one call where thinking
   might pay for itself, and it was switched off with the rest rather than measured separately.

## Phase 05 — The note workspace: read, review, edit

Shipped 2026-09-01. `/app/note/:id` becomes the three-mode workspace: Read, Edit, and a Study tab
with its empty state (phase-08 builds the tools themselves). Most of Read is the phase-01 renderer
wired to the real stored document, which is what it was designed for. The work is everything around
it — a reading mode that tells the truth, provenance a student can act on, an editor that cannot
lose a block, and two calls phase-04 priced but could not make.

**Two decisions taken with the user before any code, and they should not be re-litigated**

1. **Accept/reject is block-level, and that is the product.** Phase-04 measured that nothing emits
   inline `spans`. The span path exists anyway — the TipTap mark round-trips them and the UI handles
   them — but nothing asks the model to produce them, so there is no rubric change, no extra eval
   run and no cache invalidation. If a later phase wants per-phrase provenance, the UI is already
   there and the cost is a `PROMPT_VERSION` bump plus a live eval run.
2. **Rejecting a corrected non-prose block restores a paragraph** of the student's exact wording.
   `originalText` is prose — `n = 0.5 x 200.6 = 100.3 g` as they wrote it — and forcing it back into
   a `latex` field prints a raw-source error chip where their working should be.

**Must not undo**

1. **`my-original` is a document transform, not a filter on `origin`.** The one-line filter it
   replaced was deleting the student's own mercury calculation from their own view of their own
   notes, because a corrected block's original wording lives **only** in its `originalText` and no
   `student` block holds it. `lib/notes/reading.ts` is the whole rule; `toMyOriginal` and
   `keepOnlyMine` must keep agreeing, because one is the view and the other is its destructive twin.
2. **Block ids are ours and are minted, never asked for.** `assignBlockIds` runs in the validator on
   the way out of the pipeline and again in `migrateNoteDocument` for documents written before
   schema 1.1.0. It is idempotent on purpose: it runs on every load, after every regeneration and
   after every insert, and a version that renumbered each pass would invalidate every saved
   reference in a document nobody had touched. Nothing in `prompts/` mentions `SCHEMA_VERSION`, so
   bumping it does not move the cached prefix.
3. **The IndexedDB `upgrade` is keyed on `oldVersion`.** The v1 body created all three stores
   unconditionally, which was correct exactly once — for a browser that had never opened the
   database. Bumping to v2 without the guard would have thrown `ConstraintError` inside the upgrade
   transaction for every existing student and taken `getDb()` down its `.catch(null)` path: no
   drafts, no notes, no history, silently. Every future bump adds a numbered block; none of them
   edits an earlier one.
4. **TipTap is aliased out of the server compilation**, alongside phase-03's seven browser-only
   libraries, and `lib/editor/` is entered only through `next/dynamic({ ssr: false })`. Both halves
   are asserted structurally in `tests/unit/dynamic-imports.test.ts`, because they fail differently:
   a static import from outside `lib/editor/` ships ~300 KB of ProseMirror to a student who only
   reads their note, while a non-dynamic import inside it fails the build on the alias — and the
   tempting "fix" for that is to remove the alias, which puts the Worker back over its ceiling.
5. **A scoped regenerate lives entirely in the volatile run instruction.** The prefix a regeneration
   sends is byte-identical to a full run's and hits the same cache. `PROMPT_VERSION` still moved to
   1.3.0, because the rule is about prompt text rather than about which side of the boundary an edit
   landed on — and `prompt-cache.test.ts` now hashes `REGENERATE_INSTRUCTION` and `ASK_SYSTEM`,
   which means the run instruction is under the version guard for the first time.
6. **A regenerate is never applied until its diff has been read**, and every failure path leaves the
   section exactly as it was (`01` §5). `runRegenerate` has no verify pass and no degrade ladder,
   deliberately: the examiner checks a draft against the original notes and a fragment gives it
   neither, and there is already a section on the student's screen that a half-usable replacement
   would be worse than.
7. **`ask` is priced, not free.** Free would make it the cheapest way to run an unmetered chat
   endpoint against our key, and every guardrail in `02` §7 assumes a provider call costs its caller
   something. Migration `0002` widens `usage_event.kind` to accept it — a ledger write that violates
   a check constraint is swallowed by a `.catch()` in the edge function, so the spend stays real and
   only the record of it disappears.

**Four ways a student's work could have been lost, none of which would have been visible**

1. **The v1 → v2 upgrade** above. Found by writing the e2e seed as a **version 1** database on
   purpose, which is what a returning student's browser actually contains — and which promptly
   caught the phase-04 seed doing the same thing in the opposite direction (it opened at v1 after
   `/app` had already created v2, and threw `VersionError`). Both now seed from `/`, which never
   touches IndexedDB, after deleting the database.
2. **Autosave cancelled on unmount.** The debounce is what stops every keystroke hitting IndexedDB;
   clearing its timer on unmount without flushing turns an 800 ms window from unlikely into
   _certain_ for anyone who edits and immediately navigates away. It flushes on unmount and on
   `pagehide`/`visibilitychange` now.
3. **Bulk actions riding the keystroke debounce.** "Keep only mine" followed by a reload lost the
   change, and the e2e suite caught it. Accept all, keep only mine, applying a regenerated section,
   inserting an answer and restoring a version are single deliberate presses with nothing to
   coalesce; they persist immediately.
4. **Side effects inside a `setDoc` updater.** An updater has to be a pure function of the previous
   state; that one pushed an undo entry, took a snapshot and scheduled a write. React is entitled to
   call it twice — under `reactStrictMode` in development it does — which is two undo entries per
   edit and two timers racing to write.

**The mapping, and why it is shaped this way**

Twelve block types, and ProseMirror discards anything its schema cannot describe. Editing through a
schema that only knew about paragraphs would silently delete every formula, diagram, table and
worked example the moment a student typed — and it would look like it worked. So paragraphs and
lists are real nodes; the other ten are one atom node carrying the typed block whole, rendered by
`RenderBlock` and edited through a focused dialog. That makes "zero data loss" structural rather
than aspirational and concentrates the real risk in the two node types the property test spends its
effort on.

Three things that are not obvious and are load-bearing:

- **Section headings are nodes, not attributes.** The first cut had them as attributes and produced
  an editor with no headings in it at all: a wall of blocks with nothing to say where one part of
  the lesson ended, and no way to fix a heading the model got wrong.
- **`ProvenanceSpan` carries a per-span ordinal.** ProseMirror merges adjacent text nodes whose
  marks compare equal, so two consecutive spans with the same origin come back as one — the
  paragraph still reads correctly and the student's provenance has been quietly rewritten.
- **The block editor keys its draft on the block object, not on `block.id`.** A block inserted from
  the menu has no id yet, so keying on the id gave it the same `null` key the dialog was mounted
  with while closed, and the draft was never seeded: inserting anything opened an empty dialog.

**The round-trip test runs the real ProseMirror schema.** `Schema.nodeFromJSON().toJSON()` is what
applies the normalisation that actually loses data. Comparing `from-doc` and `to-doc` to each other
would test that they agree, which they would, right up until ProseMirror disagreed with both.

**Two things the e2e suite found that reading would not have**

- **The editor's `contenteditable` was invisible to anything driving the page by role.** Chrome maps
  a bare `contenteditable` div to `generic`, not to `textbox`, and ProseMirror does not add the role
  itself. That is a screen-reader bug that happened to be caught by a test locator.
- **`useEditor` does not re-render on every transaction in TipTap 3.** Reading
  `editor.state.selection` during render looks right and is stale, so "Ask about this" stayed
  disabled however much text was highlighted. The toolbar subscribes to `selectionUpdate` instead.
  Relatedly: `Home` then `Shift+End` inside a ProseMirror document can leave the selection collapsed
  — a triple-click is the gesture that actually selects a paragraph.

**What phase-06 inherits**

- **The cloud-sync seam is `persist()` in `lib/app/workspace/use-workspace.ts`** — one function,
  local-only today, with the flush and debounce already around it.
- **Save to library, Export and Share are honest stubs** in the action bar. Each says what it will
  do and why it cannot yet, through `onUnavailable`.
- **`LocalNote` grew `generatedAt` and `edited`.** The first is the note meta line (`06` §5.7); the
  second is what the library's "not yet reviewed" filter in `01` §3 will want.
- **Version history is local and unsynced.** `lib/store/versions.ts` prunes edit snapshots to the
  most recent 20 and never prunes a generation snapshot; a synced library has to decide whether
  history travels with a note.
- **`figure` blocks can be inserted but carry an empty `assetId`.** The renderer draws the labelled
  slot phase-01 left; wiring the upload to Storage is phase-06's, and `putAssets`/`getAsset` in
  `lib/store/drafts.ts` are the local half that already works.

**Numbers**

621 unit (was 537) · 34 eval · 35 edge · 121 Storybook axe (was 118) · 183 e2e (21 new). Worker
**1783.3 / 3072 KiB gz — 58%** (was 1731; TipTap costs 52 KiB because it never reaches the server
build). `/` 107.7 / 120 KB gz. `/app/note/[id]` first load 226 kB with the editor in a lazy chunk.
Schema 1.1.0, prompt 1.3.0.
