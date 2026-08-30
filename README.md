# Lumen

**Turn the messy notes you already have into a complete, correct, and beautiful study guide.**

Upload class notes as `.docx`, `.pdf`, photos, or pasted text. Get back a typeset study guide with
every term defined, every formula given units and a worked example, the half-finished example
finished, the errors fixed _and flagged_, and the student's own voice and mnemonics preserved. Save
it to a library, push it to Notion or Drive, export to PDF / Word / Anki. Free.

The full product plan lives in [`../lumen-blueprint/`](../lumen-blueprint/) — seven spec documents
and eleven sequenced build phases. Read `00-BRIEF.md` and `02-ARCHITECTURE.md` before changing
anything structural.

> **Status: phase-02 complete.** Scaffold and CI (00), the design system and the notes renderer
> (01), and the public marketing site in English and 简体中文 with the live demo (02). The app
> itself starts at phase-03: `/app/new` does not exist yet, so the landing page's primary call to
> action is a deliberate 404.
>
> **Live:** <https://lumen.marvinmaiwang.workers.dev>
>
> Building on this? Read [`AGENTS.md`](AGENTS.md) and [`docs/PHASE-LOG.md`](docs/PHASE-LOG.md)
> first — they carry the decisions and the traps that the code does not show.

---

## Stack

| Layer        | Choice                                                                              |
| ------------ | ----------------------------------------------------------------------------------- |
| Framework    | Next.js 15 (App Router), React 19, TypeScript strict                                |
| Styling      | Tailwind v4 driven by CSS-variable design tokens, Radix UI primitives               |
| State / data | Zustand, TanStack Query, `idb` for the local library                                |
| Backend      | Supabase — Postgres + Auth + Storage + Edge Functions (Deno)                        |
| Hosting      | Cloudflare Workers via `@opennextjs/cloudflare`                                     |
| AI           | DeepSeek V4 primary, Gemini free-tier fallback, BYOK for anything OpenAI-compatible |
| Tests        | Vitest (unit + AI evals), Playwright (e2e), Lighthouse CI (budget)                  |

## Getting started

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

`.env.example` ships working local defaults, so `pnpm dev` runs with no configuration. The app
validates its environment at boot (`lib/env.ts`) and fails with a message naming the missing
variable rather than breaking somewhere downstream.

### The local backend

Requires Docker running.

```bash
pnpm db:start     # boots Postgres, Auth, Storage, Studio
pnpm db:reset     # applies supabase/migrations from scratch, re-seeds app_config
pnpm db:serve     # serves the edge functions on :54321
```

Every edge function is a stub until its phase: each returns `501` with the TODO describing what it
will do.

```bash
curl -X POST http://127.0.0.1:54321/functions/v1/enhance
```

> **Do not run `supabase start` and `supabase functions serve` at the same time.** Both try to
> create `supabase_edge_runtime_<project>`, and the race leaves the container wedged in Docker's
> `removing` state, where even `docker rm -f` hangs — the only way out is restarting the Docker
> daemon. Let `db:start` finish first, then run `db:serve` on its own.

## Commands

| Command                                      | What it does                                                           |
| -------------------------------------------- | ---------------------------------------------------------------------- |
| `pnpm dev`                                   | Development server                                                     |
| `pnpm build`                                 | Production build                                                       |
| `pnpm typecheck`                             | `tsc --noEmit`                                                         |
| `pnpm lint` / `pnpm format`                  | ESLint / Prettier                                                      |
| `pnpm test:unit`                             | Unit tests — tokens, env, contrast, pack schema, secret leaks          |
| `pnpm test:ai`                               | AI eval suite against the mock provider (the release gate for prompts) |
| `pnpm test:e2e`                              | Playwright smoke suite                                                 |
| `pnpm pack:validate`                         | Validate curriculum packs against the JSON Schema                      |
| `pnpm cf:build` / `cf:preview` / `cf:deploy` | Build, run, and deploy the Cloudflare Worker                           |

## Layout

```
app/                 Next.js routes (marketing + the /app workspace)
components/          Design-system components — phase-01
lib/
  design/            tokens.css + tokens.ts + the theme controller
  ai/                provider interface, router, NoteDocument schema, prompts
  curriculum/        pack schema, loader, subject detection, packs/
  ingest render export store    parsers, renderers, exporters, local persistence
supabase/
  migrations/        SQL — the full schema with RLS and the app_config seed
  functions/         edge functions: enhance, ocr, notion-*, drive-*, cron-keepalive
curriculum-authoring/  docs + template for community curriculum packs
tests/               unit · e2e · ai-evals
fixtures/            the real AP Chem notes this project started from, plus the gold output
```

## Design tokens

Tokens are defined once in `lib/design/tokens.css` and mirrored in `lib/design/tokens.ts` for the
JS consumers that need literal values (Mermaid, smiles-drawer, charts). Tailwind's `@theme inline`
reads the CSS variables, so utilities follow the theme automatically.

`tests/unit/tokens-sync.test.ts` fails the build if the two files drift apart, if a color lacks a
dark counterpart, or if a color is defined only inside the `prefers-color-scheme` media block.
`tests/unit/contrast.test.ts` holds every token to the WCAG ratio its role demands.

**Theme:** `light` / `dark` / `system`, persisted in `localStorage`, applied before first paint by
a tiny blocking script so there is no flash and no layout shift. `system` removes the `data-theme`
attribute entirely, which is what lets the media query take over.

## Secrets

Public configuration is `NEXT_PUBLIC_*` and lives in `lib/env.ts`. Secrets live in
`lib/env.server.ts`, which no client component imports — deliberately, so that not even the secret
_names_ reach the browser bundle. Three things enforce this:

1. an ESLint rule banning non-public `process.env` reads outside server-only modules,
2. `serverEnv()` throwing outright if it is called in the browser,
3. `tests/unit/no-client-secrets.test.ts`, which greps the built client chunks for every secret
   name and value (`pnpm test:bundle`, run in CI after the build).

## Cost

The whole product must run under **~100 CNY/month at 200 active students**
(`02-ARCHITECTURE.md` §7). That is enforced in code at three layers — a per-user daily quota, a
hard global daily spend cap, and a kill switch — all configured in the `app_config` table, which
is seeded by the initial migration and editable in production without a deploy.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Conventional Commits, one PR per phase, CI green before
merge, screenshots in the PR description.
