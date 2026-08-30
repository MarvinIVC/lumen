# The eval suite — the release gate for prompt changes

`pnpm test:ai`. It runs in CI on every pull request and nightly against the live model.

Changing any prompt string means re-running this and bumping `PROMPT_VERSION`
(`04-AI-ENGINE.md` §10). A prompt is not a string, it is behaviour.

## What runs where

|             | CI (every PR)                    | Nightly                          |
| ----------- | -------------------------------- | -------------------------------- |
| Provider    | recorded response, replayed      | DeepSeek, live, on a tiny budget |
| Judge       | mocked                           | Gemini                           |
| Hard checks | yes                              | yes                              |
| Cost check  | yes, against the recorded tokens | yes, against real usage          |
| Costs money | no                               | a few fen                        |

CI must never spend money or depend on a third party being up, so it replays recorded responses —
chunked into 37-byte pieces on the way in, which means every run also exercises the tolerant
streaming parser against real content. What CI is testing is the _pipeline and the checks_: that a
prompt change did not break assembly, parsing, validation, the verify pass or the ledger, and that
a document which should fail a check does.

What CI cannot test is whether the model is any good. That is the nightly run's job.

## The recorded responses are hand-authored, for now

`recorded/*.json` were written by hand to the standard of the `-good.md` note beside each fixture,
because there was no API key when the suite was built. **Replace each one with a real captured
response the first time the nightly run produces a passing document for that fixture** — a real
capture exercises shapes a person does not think to write, and it is the difference between
checking that the gate works and checking that the model clears it.

Every recording carries a `source` field saying which it is. Keep that honest.

## Adding a fixture

1. `fixtures/<id>-raw.md` — a real, messy, anonymised note for one lesson. Do not tidy it.
2. `fixtures/<id>-good.md` — what a great result contains, in a page. This is what the judge is
   given as its reference.
3. A case in `cases.ts`: the confirmed context, the options, and the assertions that make the
   `-good.md` note machine-checkable. Assertions should name the specific thing that would be lost
   — the mnemonic, the units, the completed example — not "is good".
4. `recorded/<id>.json` so CI has something to replay.

## The checks

- `hard-checks.ts` — the rubric's absolutes, applied to every fixture: schema validity and the §5
  post-parse rules, three-part formulas, corrections marked inline, captioned visuals, mixed
  provenance, no invented quotations, no invented citations, and the study-tool counts.
- `cases.ts` — per-lesson assertions. This is where the definition of done for phase-04 lives:
  the C₅H₇N example finished, the seven diatomics with the student's own mnemonic verbatim, the
  mercury calculation with units and significant figures, the atomic-mass/molar-mass distinction.
- `judge.ts` — six dimensions, 1–5, gated at an average of 4 with nothing below 3.
- `cost.ts` — median CNY per call against `cost-baseline.json`, failing above +25%.

## The cost baseline

`UPDATE_COST_BASELINE=1 pnpm test:ai` rewrites it. Do that deliberately, with the new numbers in
the pull request — never to turn a red build green.
