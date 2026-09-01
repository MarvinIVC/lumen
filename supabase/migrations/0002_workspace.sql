-- ---------------------------------------------------------------------------
-- Phase-05 — the note workspace.
--
-- Two calls the workspace makes that the ledger has never seen: a scoped
-- regeneration of a single section, and "ask about this". `regen` was already
-- a legal `kind` and already priced — phase-04 put the weight in
-- `credit_weights` before anything could spend it — but `ask` is new, and a
-- ledger write that violates a check constraint is thrown away inside a
-- `.catch()` in the edge function. The spend would still be real; only the
-- record of it would be missing, which is the one failure the cost ceiling
-- cannot survive.
-- ---------------------------------------------------------------------------

alter table public.usage_event drop constraint if exists usage_event_kind_check;

alter table public.usage_event
  add constraint usage_event_kind_check
  check (kind in ('enhance', 'ocr', 'regen', 'detect', 'verify', 'ask'));

-- ---------------------------------------------------------------------------
-- Token ceilings for the two new kinds.
--
-- A regenerate is one section, not a document, and inheriting the whole-document
-- ceiling would let a re-roll of a two-paragraph section cost as much as the
-- generation that produced the whole note. 4,000 is comfortably more than the
-- largest section in the deployed AP Chem output (~1,400 output tokens).
--
-- `ask` is two sentences. 600 is generous for two sentences and is the cheapest
-- ceiling in the product; it is also the reason the call can be offered freely
-- enough to be useful. The prompt asks for three sentences at most, so a run
-- that reaches this limit is a run that ignored the instruction, and truncating
-- it is the correct outcome.
-- ---------------------------------------------------------------------------
update public.app_config
set value = jsonb_set(
      value,
      '{max_tokens}',
      (value -> 'max_tokens') || '{"regen": 4000, "ask": 600}'::jsonb
    )
where key = 'limits';

-- Same reasoning as phase-04's row: both of these are shaped work rather than
-- judgement, and reasoning on a call this small is pure cost.
update public.app_config
set value = value || '{"ask": "none"}'::jsonb
where key = 'reasoning';

-- ---------------------------------------------------------------------------
-- What "ask about this" costs a student.
--
-- The same weight as a regeneration (01-PRODUCT.md §4 prices "regenerate
-- section" at 0.25 and phase-05 §11 puts ask alongside it). It is deliberately
-- not free: free would make it the cheapest way to run an unmetered chat
-- endpoint against our key, and the whole guardrail design in 02 §7 depends on
-- every provider call costing the caller something.
-- ---------------------------------------------------------------------------
update public.app_config
set value = value || '{"ask": 0.25}'::jsonb
where key = 'credit_weights';
