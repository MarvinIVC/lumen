-- ---------------------------------------------------------------------------
-- 0001 — what the AI engine needs from the database (04-AI-ENGINE.md, 02 §7)
--
-- Three things, and the last two are the interesting ones:
--
--   1. `usage_event.ip_hash`, because the per-IP hourly limit in §7 layer 3 had
--      nowhere to live. It is a salted hash, never an address — the ledger is a
--      cost record, not a log of who was where.
--
--   2. `guardrail_snapshot()`. The quota check runs before every shared-key call
--      and is therefore on the critical path of the only thing students wait
--      for. Six separate round trips from the edge function would be six times
--      the latency and six chances to see a half-consistent picture; one
--      function reads them together, where the indexes are.
--
--   3. `record_usage()`. Appending the event and moving `daily_cost` have to
--      happen together or the global cap can be defeated by concurrency —
--      several calls reading the same pre-increment total is exactly the shape
--      of a runaway. One statement, one transaction, one upsert.
--
-- Both functions are called only with the service role, from the edge
-- functions. Execute is revoked from the client roles so a leaked anon key
-- cannot read the ledger's shape.
-- ---------------------------------------------------------------------------

alter table public.usage_event add column if not exists ip_hash text;

-- `daily_cost.cost_cny` was numeric(10,2) — the fen. That is the right precision for reading a
-- number off a dashboard and the wrong one for accumulating it: `record_usage` adds each call's
-- cost to the running total, so every call was being rounded to the nearest fen before it was
-- added. A typical call costs ~0.007 CNY, which rounds to 0.01 — a 40% overstatement, and at
-- 4,000 calls a month the drift is a large fraction of the 100 CNY ceiling the cap defends.
-- `usage_event.cost_cny` has always been numeric(10,5); the running total now matches it.
alter table public.daily_cost alter column cost_cny type numeric(12,5);

comment on column public.usage_event.ip_hash is
  'Salted SHA-256 of the caller IP. The key for the per-hour rate limit (02-ARCHITECTURE.md §7 layer 3). Never the address itself.';

create index if not exists usage_event_ip_idx on public.usage_event (ip_hash, created_at desc);

-- ---------------------------------------------------------------------------
-- Everything the router's `decide()` needs, in one read.
-- ---------------------------------------------------------------------------
create or replace function public.guardrail_snapshot(
  p_owner uuid,
  p_anon  text,
  p_ip    text
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with window_events as (
    select kind, credits, created_at
    from public.usage_event
    where created_at >= now() - interval '24 hours'
      and (
        (p_owner is not null and owner = p_owner)
        or (p_owner is null and p_anon is not null and anon_id = p_anon)
      )
  )
  select jsonb_build_object(
    'monthCostCny', coalesce((
      select sum(cost_cny) from public.daily_cost
      where day >= date_trunc('month', (now() at time zone 'utc'))::date
    ), 0),
    'dayCostCny', coalesce((
      select cost_cny from public.daily_cost
      where day = (now() at time zone 'utc')::date
    ), 0),
    'creditsLast24h', jsonb_build_object(
      -- A regeneration is a cheaper enhancement, not a separate allowance, so the two share a
      -- budget. OCR has its own line in `app_config.quota` and is counted apart.
      'enhance', coalesce((select sum(credits) from window_events where kind in ('enhance','regen')), 0),
      'ocr',     coalesce((select sum(credits) from window_events where kind = 'ocr'), 0)
    ),
    'oldestEventLast24h', (select min(created_at) from window_events),
    'anonLifetimeCalls', case
      when p_owner is not null or p_anon is null then 0
      else coalesce((
        select count(*) from public.usage_event
        where anon_id = p_anon and kind in ('enhance','regen') and byok = false
      ), 0)
    end,
    'ipCallsLastHour', case
      when p_ip is null then 0
      else coalesce((
        select count(*) from public.usage_event
        where ip_hash = p_ip and created_at >= now() - interval '1 hour'
      ), 0)
    end
  );
$$;

-- ---------------------------------------------------------------------------
-- Append to the ledger and move the day's total, atomically.
-- ---------------------------------------------------------------------------
create or replace function public.record_usage(
  p_owner            uuid,
  p_anon             text,
  p_kind             text,
  p_provider         text,
  p_model            text,
  p_tokens_in        int,
  p_tokens_out       int,
  p_cached_tokens_in int,
  p_cost             numeric,
  p_credits          numeric,
  p_byok             boolean,
  p_ip               text
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  insert into public.usage_event (
    owner, anon_id, kind, provider, model,
    tokens_in, tokens_out, cached_tokens_in, cost_cny, credits, byok, ip_hash
  ) values (
    p_owner, p_anon, p_kind, p_provider, p_model,
    greatest(p_tokens_in, 0), greatest(p_tokens_out, 0), greatest(p_cached_tokens_in, 0),
    greatest(p_cost, 0), greatest(p_credits, 0), coalesce(p_byok, false), p_ip
  );

  -- A student's own key is their spend, not ours: it must never move the number the community
  -- cap is checked against.
  if coalesce(p_byok, false) = false then
    insert into public.daily_cost (day, cost_cny, calls)
    values ((now() at time zone 'utc')::date, greatest(p_cost, 0), 1)
    on conflict (day) do update
      set cost_cny = public.daily_cost.cost_cny + excluded.cost_cny,
          calls    = public.daily_cost.calls + 1;
  end if;
end;
$$;

revoke execute on function public.guardrail_snapshot(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.record_usage(uuid, text, text, text, text, int, int, int, numeric, numeric, boolean, text)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- What a live run against DeepSeek V4 taught us that the spec could not.
--
-- 1. The model reasons before it answers, and the reasoning is billed as output
--    *and* counted against `max_tokens`. With it on, a full study guide spent
--    its budget thinking and came back truncated: 117 s, 14k output tokens,
--    0.14 CNY, and no document at all. With `reasoning_effort: "none"` the same
--    fixture produced a document that passes every hard check, in 72 s.
--
--    So reasoning is off for now, everywhere. It is a row rather than a
--    constant because that is a judgement about one model at one point in time,
--    and the next model may deserve the opposite answer.
--
-- 2. 90 s — the number 04-AI-ENGINE.md §2 names as the point at which the
--    fallback provider gets a turn — was written before models reasoned. A
--    generation that legitimately takes 72 s has no headroom against it, and a
--    timeout that always fires is a fallback that always fires. 100 s leaves
--    room for the verify pass inside the edge function's own 150 s ceiling.
--
-- 3. The measured draft is ~7k output tokens, against a `complete` cap of 8k.
--    That is close enough to the ceiling that a longer lesson would truncate,
--    which is a broken note rather than a cheaper one. Raised, with the global
--    caps still holding the budget.
-- ---------------------------------------------------------------------------
update public.app_config
set value = value
  || '{"timeout_ms": 100000}'::jsonb
  || jsonb_build_object(
       'max_tokens',
       (value -> 'max_tokens') || '{"complete": 10000, "study_guide": 12000}'::jsonb
     )
where key = 'limits';

insert into public.app_config (key, value) values
  ('reasoning', '{"enhance":"none","regen":"none","verify":"none","detect":"none","ocr":"none"}'::jsonb)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- The fallback model, corrected against the live API.
--
-- `gemini-2.5-flash` — named in 02-ARCHITECTURE.md §2 and seeded by phase-00 —
-- returns 404 for any API key issued now: "no longer available to new users".
-- The entire fallback path was therefore dead on a fresh deployment, and
-- nothing would have noticed until the day DeepSeek was down, which is the one
-- day it matters.
--
-- Gemini 3.x models always think, and unlike DeepSeek the thinking cannot be
-- switched off (`thinkingBudget: 0` is rejected); the provider asks for the
-- lowest level instead and the token budget has to cover it.
--
-- The free tier still exists, so the rate card stays zero for the shared
-- fallback. The paid rates as of 2026-08-31 are $0.75/M in and $3.75/M out
-- (rising on 2027-01-01), recorded here so that a move off the free tier is an
-- edit rather than a discovery.
-- ---------------------------------------------------------------------------
update public.app_config
set value = value || '{"fallback": "gemini-3.6-flash"}'::jsonb
where key = 'models';

update public.app_config
set value = value || $json${
  "gemini-3.6-flash": {
    "peak":     { "in_miss": 0, "in_hit": 0, "out": 0 },
    "off_peak": { "in_miss": 0, "in_hit": 0, "out": 0 },
    "_paid_rates_2026_08_31": { "usd_in": 0.75, "usd_out": 3.75, "rises": "2027-01-01" }
  }
}$json$::jsonb
where key = 'pricing';
