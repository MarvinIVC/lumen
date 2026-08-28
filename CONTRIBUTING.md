# Contributing to Lumen

## The bar

Three things are pass/fail gates on every change, not finishing touches:

1. **It looks like Lumen, not like a component kit.** `03-DESIGN.md` is the standard. If a screen
   could be any SaaS dashboard, it is not done.
2. **Nothing the AI writes goes unmarked.** Every added, clarified, or corrected fragment carries
   its provenance through the schema, the renderer, and the exports.
3. **The cost ceiling holds.** Anything that can trigger a model call goes through the router in
   `lib/ai/router.ts` and the guardrails in `02-ARCHITECTURE.md` §7.

## Workflow

One phase per pull request. Each phase prompt in `lumen-blueprint/prompts/` ends with a Definition
of Done and verification steps — run them yourself before opening the PR, and put screenshots
(light **and** dark, mobile **and** desktop) in the description.

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

Before pushing:

```bash
pnpm typecheck && pnpm lint && pnpm test:unit && pnpm test:ai && pnpm build
```

The pre-commit hook runs lint-staged and a typecheck; `commit-msg` enforces Conventional Commits.

## Commits

[Conventional Commits](https://www.conventionalcommits.org/):

```
feat(ai): stream partial sections into the read view
fix(render): drop structure blocks whose SMILES fails to parse
chore(deps): bump tailwind to 4.3.3
```

Scopes: `app`, `ai`, `ci`, `curriculum`, `deps`, `design`, `export`, `ingest`, `render`, `store`,
`supabase`, `tests`, `tooling`.

## Code conventions

- **TypeScript strict**, including `noUncheckedIndexedAccess`. No `any`.
- **Server-only code is named `*.server.ts`.** That suffix is also the ESLint allowlist for reading
  secrets. If you need a secret in a new file, the answer is almost always that the logic belongs
  in an edge function.
- **Tokens, never literals.** No hex colors, px spacing, or font stacks in components. If a value
  is missing, add it to `lib/design/tokens.css` _and_ `lib/design/tokens.ts` — the sync test will
  fail if you do only one.
- **Prettier owns formatting**, including Tailwind class order. Do not hand-sort.
- Comments explain _why_. The code already says what.

## Tests

| Suite    | Command                  | What it protects                                                       |
| -------- | ------------------------ | ---------------------------------------------------------------------- |
| Unit     | `pnpm test:unit`         | Token sync, contrast ratios, env validation, pack schema, secret leaks |
| AI evals | `pnpm test:ai`           | The enhancement contract — the release gate for any prompt change      |
| E2E      | `pnpm test:e2e`          | The smoke path in Chromium and mobile WebKit                           |
| Budget   | `pnpm exec lhci autorun` | Performance, accessibility, best-practices, SEO                        |

**Changing a prompt requires bumping `PROMPT_VERSION` and re-running `pnpm test:ai`.** That
invalidates the provider's prefix cache, which is expected — see `04-AI-ENGINE.md` §10.

## Curriculum packs

Packs are the highest-leverage contribution and need no TypeScript. See
[`curriculum-authoring/README.md`](curriculum-authoring/README.md). The one rule that matters:
write everything in your own words. Never paste syllabus text, past papers, or mark schemes.

## Privacy

A student's notes are theirs (`00-BRIEF.md` §5.8). Do not add anything that logs note content,
sends it to a third party beyond the model call the student asked for, or retains it longer than
the request. Sentry is configured with `sendDefaultPii: false` — keep it that way.
