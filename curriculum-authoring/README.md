# Authoring a curriculum pack

A pack is one JSON file that tells the AI what a course actually covers, how deep it goes, and
where it stops. It is the difference between a study guide that matches your syllabus and one that
wanders. See `05-CURRICULUM-PACKS.md` in the blueprint for the full rationale.

## The rules that are not negotiable

1. **Write everything in your own words.** Do not paste syllabus text, learning objectives, past
   paper questions, or mark schemes. Paraphrase the _scope_; never reproduce the _wording_.
2. **Name the authority nominatively.** "Aligned to the College Board AP Chemistry Course and Exam
   Description" is fine. "Official AP Chemistry pack" is not — it implies endorsement.
3. **Describe where the course stops**, not just what it covers. `requiredDepth` is the most
   valuable field in the file: it is what stops the model over-reaching.
4. **Misconceptions in the student's voice.** Write the wrong idea the way a student would say it.

## Getting started

```bash
cp curriculum-authoring/pack.template.json lib/curriculum/packs/my-course.json
pnpm pack:validate lib/curriculum/packs/my-course.json
```

`pnpm pack:validate` with no arguments checks every pack in `lib/curriculum/packs/`. It runs in CI,
so a malformed pack cannot merge.

## Field notes

| Field                                  | What good looks like                                                                                                                             |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`                                   | kebab-case, unique, stable forever — it is stored on saved notes.                                                                                |
| `version`                              | `YYYY.N`. Bump when content changes; the loader records it on generated notes.                                                                   |
| `domainFamily`                         | Picks the prompt's structural template. Chemistry/Physics/Maths → `stem-quantitative`; Biology → `stem-descriptive`; History → `history-social`. |
| `globalConventions.notation`           | Short imperative rules: "state units on every quantity".                                                                                         |
| `globalConventions.penalisedShortcuts` | The informal shortcuts your course marks down. Enormously effective.                                                                             |
| `units[].summary`                      | Two sentences on what the unit is for and where it sits.                                                                                         |
| `topics[].scope`                       | What a student must be able to **do**, in verbs.                                                                                                 |
| `topics[].mustDefine`                  | Every term that must appear defined. The rubric enforces it.                                                                                     |
| `topics[].requiredDepth`               | Both the ceiling and the floor. Say what is out of scope.                                                                                        |

## Budget

The rendered pack block for one unit must stay under roughly **1200 tokens** so it caches cheaply
(02-ARCHITECTURE.md §7 depends on prefix caching holding the cost ceiling). If a unit has many
topics, tighten `scope` and `requiredDepth` rather than dropping topics.

## Status

Set `status` to `draft` while you work, `beta` once a real lesson has been generated against it and
checked by someone who teaches the course, `stable` after a term of use.
