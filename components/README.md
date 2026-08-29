# The Lumen design system

**lucid · crafted · calm.** Two things have to clear the bar in 03-DESIGN.md §1: the app, and the
notes it makes. This directory is the first; `/lib/render` is the second.

Read `lumen-blueprint/03-DESIGN.md` before adding anything. This file is the working companion to
it — what exists, when to reach for it, and the handful of decisions that are easy to undo by
accident.

```
components/ui/        primitives — the vocabulary
components/domain/    the product's own components
components/study/     flashcards and the quiz
lib/render/           the note itself: NoteDocument and its blocks
lib/design/           tokens, theme, motion, useThemeTokens
```

Run `pnpm storybook` to see all of it. Every component has a story; `pnpm test:stories` runs axe
over each one and is part of CI.

---

## The rules that are not negotiable

**Tokens are the only source of colour, space and type.** No hex, no `p-[13px]`. ESLint fails the
build for `.ts`/`.tsx` and `tests/unit/tokens-only.test.ts` covers CSS too. If you need a value the
scale does not have, the scale is probably wrong — change `lib/design/tokens.css` _and_
`tokens.ts` together (a test holds them in sync).

**Tailwind v4 wants `(--token)`, not `[--token]`.** `duration-[--dur-fast]` compiles to
`transition-duration: --dur-fast`, which is invalid and silently does nothing. Write
`duration-(--dur-fast)`, `max-w-(--measure)`, `w-(--margin-col)`. Nothing catches this but reading.

**`--text-faint` and `--warning` are marker tokens.** They measure 3.07:1 and 3.72:1 — below the
body-copy bar. They may draw a border, tint a rule, or colour an icon. They may not spell out
words. Use `--text-muted` for small text. `tests/unit/contrast.test.ts` holds the ledger.

**An icon-only control has a name.** `IconButton.label`, `ScrollArea.label` and
`PopoverContent.label` are required props rather than optional ones, because each is an element
axe will fail without a name and the type system is a better place to catch it than review.

**Reduced motion means no motion.** Not less. `globals.css` neutralises CSS animation globally;
`useReducedMotion()` is for the cases JavaScript decides, like whether to stagger at all.

---

## Choosing a primitive

| You want                                       | Use                 | Not                                                                                                                      |
| ---------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| A one-of-N choice that changes a view in place | `SegmentedControl`  | `Tabs variant="segmented"` — a tab owns a panel and announces `aria-controls`; without one you ship a dangling reference |
| Navigation between panels of content           | `Tabs`              | `SegmentedControl`                                                                                                       |
| An on/off setting                              | `Switch`            | A two-option `SegmentedControl`                                                                                          |
| One of a few options, each needing a sentence  | `RadioGroup`        | `Select`                                                                                                                 |
| One of many options, filterable                | `Combobox`          | `Select`                                                                                                                 |
| One of ~5–15 known options                     | `Select`            | `Combobox`                                                                                                               |
| A short label on hover                         | `Tooltip`           | `Popover`                                                                                                                |
| A sentence, or anything interactive            | `Popover`           | `Tooltip`                                                                                                                |
| A decision that blocks the flow                | `Dialog`            | `Toast`                                                                                                                  |
| Telling someone what just happened             | `Toast`             | `Dialog`                                                                                                                 |
| The same, on a phone                           | `Drawer`            | `Dialog`                                                                                                                 |
| A status mark                                  | `Badge`             | `Chip`                                                                                                                   |
| A filter, a selected thing, a removable thing  | `Chip`              | `Badge`                                                                                                                  |
| A labelled form control                        | `Field` wrapping it | hand-wiring `aria-describedby`                                                                                           |

`Field` is the one to remember: it owns the label, the hint, the error, `aria-describedby`,
`aria-invalid` and `aria-required`, and the controls read it from context. `<Field label="Course">
<Input /></Field>` is correct by construction.

---

## The notes system (`/lib/render`)

The finished note is a **typeset document, not a card feed**. That sentence decides most questions
here.

- `NoteDocument` is a pure function of `doc`. No fetching, no stores. The read view, the streaming
  view, the share page and the print route are the same component with different CSS.
- One component per `Block['type']`, registered in `blocks/index.tsx`.
- Provenance wraps blocks (`ProvenanceBlock`) and phrases (`ProvenanceSpan`). Corrections stay
  visible in every reading mode — they are a learning surface, not noise to hide.
- Margin notes sit in the margin above 1100px (`--breakpoint-note`), fold into `<details>` below
  it, and become numbered endnotes in print.
- Figures span the measure _and_ the margin column. A five-node flowchart squeezed into 68ch comes
  out at 9px type.

### Third-party renderers

One hook, `useThemeTokens()`, is the single source of resolved token values (§9). Everything else
follows from how each library consumes them:

| Library       | Themed by                            | On theme flip                                 |
| ------------- | ------------------------------------ | --------------------------------------------- |
| KaTeX         | `currentColor` in `notes.css`        | nothing to do                                 |
| Charts        | CSS variables, directly              | nothing to do                                 |
| Mermaid       | `themeVariables`, baked into the SVG | **must re-render** — depend on `themeVersion` |
| smiles-drawer | a theme object, baked into the SVG   | **must re-render**                            |

All four are dynamically imported. `tests/unit/dynamic-imports.test.ts` fails the build if a static
import creeps in, because the damage is invisible until someone reads the build stats.

### Two traps worth knowing about

**`overflow-x: auto` makes the other axis scrollable too.** CSS computes `overflow-y` to `auto` as
soon as `overflow-x` is not `visible`, and KaTeX's display maths overhangs its line box by a few
pixels — so every equation on the page became a keyboard-unreachable scroll region. Display maths
carries vertical headroom for this reason. `useScrollableRegion` labels a container only when it
genuinely overflows, and writes the attributes to the DOM rather than through React state so
nothing can observe the element mid-update.

**Inline markdown is matched by position, not priority.** Taking maths first splits
`**a ($x$) b**` across the `**` pair and the bold never closes. See `markdown/inline.tsx`.

---

## Writing the words

01-PRODUCT.md §6 is the voice. In practice:

- Say what happened, why, and what to do next. "That PDF is a scan, not text" — then how to fix it.
- Never apologise, never blame. "Oops! Something went wrong" tells nobody anything.
- Lead with what remains, not what is spent: "3 free study guides left today".
- Corrections are "what to relearn", never "you were wrong".
- Say _reading_ a file, not _uploading_ it. Parsing is local, and the privacy promise is only as
  good as the smallest wording in the product.

---

## Adding a component

1. Check the table above — most new components are a composition of existing ones.
2. Build it in `ui/` (vocabulary), `domain/` (product), or `lib/render/` (the note).
3. Write the story next to it: every variant, every state, and the edge case you had to think
   about. Stories are the documentation.
4. `pnpm test:stories` — axe runs on each one and CI will not accept a violation.
5. Check it in dark. The toolbar drives the real theme mechanism, so if it works there it works.

## The anti-patterns (03-DESIGN.md §1)

Purple-gradient "AI" clichés · neon glassmorphism · cramped dashboards · emoji as UI · five accent
colours · drop shadows everywhere · hero images of smiling stock students.

Two elevation levels, ever. Borders do the structural work.
