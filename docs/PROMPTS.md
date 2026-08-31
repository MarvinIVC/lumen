# Prompts

Every prompt string the product sends lives in `lib/ai/prompts/`. There are five:

| File              | What it is                                                        |
| ----------------- | ----------------------------------------------------------------- |
| `rubric.ts`       | `RUBRIC_SYSTEM` — the standing instruction (04-AI-ENGINE.md §4.2) |
| `schema-block.ts` | The NoteDocument schema, restated for the model                   |
| `domains.ts`      | Six `DOMAIN_TEMPLATE_BLOCK`s, one per domain family (§4.3)        |
| `detect.ts`       | The Stage A classifier (§3)                                       |
| `verify.ts`       | The Stage C examiner (§6)                                         |
| `ocr.ts`          | Transcription for a photographed page                             |

`index.ts` assembles them, and the assembly order is the load-bearing part.

## The order, and why it cannot change casually

```
system   RUBRIC_SYSTEM                          stable  ┐
user[0]  CURRICULUM_PACK_BLOCK                  stable  │ the cached prefix
user[1]  DOMAIN_TEMPLATE_BLOCK (+ the schema)   stable  ┘
user[2]  RUN_INSTRUCTION (context, options, notes)      volatile
```

DeepSeek's prefix caching is automatic and server-side: it happens when the start of a prompt is
byte-identical to a recent one, and a cached input token costs about a thirty-first of a fresh one.
Nothing is sent to ask for it and nothing reports that it stopped — the output is identical and the
bill is not.

So the rule is negative. **Nothing above `user[2]` may vary per call**: no timestamp, no note id,
no title, no filename, no locale-formatted date, no random ordering of a `Set`.
`buildEnhancePrompt` takes no clock and no id for that reason, and
`tests/unit/prompt-cache.test.ts` asserts two different notes on the same lesson produce a
byte-identical prefix.

## Changing a prompt

Three things, every time:

1. **Bump `PROMPT_VERSION`** in `lib/ai/versions.ts`. Documents record the version they were
   generated with, and the version is what tells a later reader why two notes on the same lesson
   read differently.
2. **Re-run `pnpm test:ai`.** Every eval result taken before the change is stale. If a hard check
   now fails, the prompt change broke something specific and nameable — that is what the checks
   are for.
3. **Update the hash** in `tests/unit/prompt-cache.test.ts`. It fails on any prompt edit, on
   purpose: it is the reminder that produces the first two steps.

Changing a prompt also invalidates the provider's prefix cache for everyone until the new one
warms. That is expected, costs a few fen, and is not a reason to avoid a good change.

## What belongs where

- **Rules that apply to every lesson** go in `RUBRIC_SYSTEM`. It is the most-cached string in the
  product and the most expensive to get wrong.
- **Anything family-specific** goes in the domain block: how a history lesson should be structured
  is not a fact about chemistry.
- **Anything course-specific** goes in a curriculum pack (`lib/curriculum/packs/*.json`), never in
  a prompt. Packs are data, contributed by people who teach the course, and they version
  independently.
- **Anything about this one run** goes in the run instruction, which is rebuilt per call.

The rubric is transcribed close to verbatim from `04-AI-ENGINE.md` §4.2. The spec is the contract;
an improvement to the wording is a change to the product, not to a string, and it goes through the
three steps above like any other.
