-- Lumen initial schema — 02-ARCHITECTURE.md §4.
--
-- Ownership model: everything belongs to exactly one profile and is readable only by that
-- profile, with two exceptions. `share` is publicly readable while it is live, because that is
-- the whole point of a share link. `app_config` is service-role only, because the edge functions
-- read the quota and kill-switch from it and nobody else should see or touch it.
--
-- Edge functions use the service role and therefore bypass RLS; every policy below is written for
-- the browser's anon/authenticated key.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- profile — 1:1 with auth.users
-- ---------------------------------------------------------------------------
create table public.profile (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  locale       text not null default 'en',
  -- { provider, base_url, key_ciphertext, model } — the key is encrypted with BYOK_ENC_KEY and
  -- is only ever decrypted inside an edge function.
  byok         jsonb,
  -- appearance, default mode/depth/visuals/voice
  prefs        jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

comment on column public.profile.byok is
  'BYOK config. key_ciphertext is a libsodium secretbox blob; never return it to the client.';

-- ---------------------------------------------------------------------------
-- course / unit
-- ---------------------------------------------------------------------------
create table public.course (
  id         uuid primary key default gen_random_uuid(),
  owner      uuid not null references public.profile (id) on delete cascade,
  subject    text not null,
  curriculum text not null
    check (curriculum in ('AP','IB_HL','IB_SL','A_LEVEL','IGCSE','INTERNAL','GENERAL')),
  name       text not null,
  pack_id    text,
  color      text,
  created_at timestamptz not null default now()
);

create table public.unit (
  id         uuid primary key default gen_random_uuid(),
  course     uuid not null references public.course (id) on delete cascade,
  name       text not null,
  ordinal    int not null default 0,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- note
-- ---------------------------------------------------------------------------
create table public.note (
  id         uuid primary key default gen_random_uuid(),
  owner      uuid references public.profile (id) on delete cascade,
  unit       uuid references public.unit (id) on delete set null,
  course     uuid references public.course (id) on delete set null,
  -- Client-generated id used to dedupe the one-time local -> cloud merge on sign-in (§4).
  local_id   text,
  title      text not null default 'Untitled',
  subject    text,
  curriculum text,
  topic      text,
  language   text not null default 'en',
  mode       text check (mode in ('tidy','complete','study_guide')),
  status     text not null default 'draft'
    check (status in ('draft','generating','ready','error')),
  doc        jsonb,   -- the NoteDocument (04-AI-ENGINE.md §5)
  source     jsonb,   -- { kind, filenames, extracted_char_count, ocr_pages }
  stats      jsonb,   -- { ai_added, ai_corrected, open_questions, tokens_in, tokens_out, cost_cny }
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner, local_id)
);

create table public.note_asset (
  id           uuid primary key default gen_random_uuid(),
  note         uuid not null references public.note (id) on delete cascade,
  storage_path text not null,
  kind         text not null,
  alt          text
);

-- ---------------------------------------------------------------------------
-- study tools
-- ---------------------------------------------------------------------------
create table public.flashcard (
  id            uuid primary key default gen_random_uuid(),
  note          uuid not null references public.note (id) on delete cascade,
  front         text not null,
  back          text not null,
  hint          text,
  ease          real not null default 2.5,
  interval_days int  not null default 0,
  due           date,
  created_at    timestamptz not null default now()
);

create table public.quiz_item (
  id          uuid primary key default gen_random_uuid(),
  note        uuid not null references public.note (id) on delete cascade,
  kind        text not null check (kind in ('multiple-choice','short-answer')),
  prompt      text not null,
  choices     jsonb,
  answer      text not null,
  explanation text,
  section_ref text
);

-- ---------------------------------------------------------------------------
-- share — the one publicly readable table
-- ---------------------------------------------------------------------------
create table public.share (
  id          text primary key,   -- short random id, used in /s/:id
  note        uuid not null references public.note (id) on delete cascade,
  owner       uuid not null references public.profile (id) on delete cascade,
  expires_at  timestamptz,
  allow_index boolean not null default false,
  revoked     boolean not null default false,
  created_at  timestamptz not null default now()
);

create table public.integration (
  id               uuid primary key default gen_random_uuid(),
  owner            uuid not null references public.profile (id) on delete cascade,
  kind             text not null check (kind in ('notion','drive')),
  token_ciphertext text not null,
  meta             jsonb not null default '{}'::jsonb,  -- workspace/db/folder mappings per course
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (owner, kind)
);

-- ---------------------------------------------------------------------------
-- Quota / cost ledger — the cost ceiling depends on this (§7)
-- ---------------------------------------------------------------------------
create table public.usage_event (
  id         bigint generated always as identity primary key,
  owner      uuid references public.profile (id) on delete set null,
  anon_id    text,   -- signed cookie value, for signed-out callers
  kind       text not null check (kind in ('enhance','ocr','regen','detect','verify')),
  provider   text not null,
  model      text not null,
  tokens_in  int  not null default 0,
  tokens_out int  not null default 0,
  cached_tokens_in int not null default 0,
  cost_cny   numeric(10,5) not null default 0,
  credits    numeric(6,3)  not null default 0,
  byok       boolean not null default false,
  created_at timestamptz not null default now(),
  -- Every event must be attributable to someone, or the quota key is meaningless.
  constraint usage_event_has_subject check (owner is not null or anon_id is not null)
);

create table public.daily_cost (
  day      date primary key,
  cost_cny numeric(10,2) not null default 0,
  calls    int not null default 0
);

create table public.app_config (
  key   text primary key,
  value jsonb not null
);

-- ---------------------------------------------------------------------------
-- Indexes — the quota check runs before every shared-key call, so it must be cheap.
-- ---------------------------------------------------------------------------
create index course_owner_idx        on public.course (owner);
create index unit_course_idx         on public.unit (course, ordinal);
create index note_owner_updated_idx  on public.note (owner, updated_at desc);
create index note_unit_idx           on public.note (unit);
create index note_course_idx         on public.note (course);
create index note_asset_note_idx     on public.note_asset (note);
create index flashcard_note_idx      on public.flashcard (note);
create index flashcard_due_idx       on public.flashcard (note, due);
create index quiz_item_note_idx      on public.quiz_item (note);
create index share_note_idx          on public.share (note);
create index integration_owner_idx   on public.integration (owner);
create index usage_event_owner_idx   on public.usage_event (owner, created_at desc);
create index usage_event_anon_idx    on public.usage_event (anon_id, created_at desc);

-- ---------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger note_touch_updated_at
  before update on public.note
  for each row execute function public.touch_updated_at();

create trigger integration_touch_updated_at
  before update on public.integration
  for each row execute function public.touch_updated_at();

-- A profile row for every new auth user, so nothing has to create it lazily.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profile (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', null))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.profile     enable row level security;
alter table public.course      enable row level security;
alter table public.unit        enable row level security;
alter table public.note        enable row level security;
alter table public.note_asset  enable row level security;
alter table public.flashcard   enable row level security;
alter table public.quiz_item   enable row level security;
alter table public.share       enable row level security;
alter table public.integration enable row level security;
alter table public.usage_event enable row level security;
alter table public.daily_cost  enable row level security;
alter table public.app_config  enable row level security;

-- profile: you, and only you.
create policy profile_select on public.profile
  for select using (auth.uid() = id);
create policy profile_update on public.profile
  for update using (auth.uid() = id) with check (auth.uid() = id);
create policy profile_insert on public.profile
  for insert with check (auth.uid() = id);

-- course / note / integration: owner-only, all four verbs.
create policy course_owner on public.course
  for all using (auth.uid() = owner) with check (auth.uid() = owner);

create policy note_owner on public.note
  for all using (auth.uid() = owner) with check (auth.uid() = owner);

create policy integration_owner on public.integration
  for all using (auth.uid() = owner) with check (auth.uid() = owner);

-- unit: owned transitively through its course.
create policy unit_owner on public.unit
  for all
  using (exists (select 1 from public.course c where c.id = unit.course and c.owner = auth.uid()))
  with check (exists (select 1 from public.course c where c.id = unit.course and c.owner = auth.uid()));

-- Children of a note: owned transitively through the note.
create policy note_asset_owner on public.note_asset
  for all
  using (exists (select 1 from public.note n where n.id = note_asset.note and n.owner = auth.uid()))
  with check (exists (select 1 from public.note n where n.id = note_asset.note and n.owner = auth.uid()));

create policy flashcard_owner on public.flashcard
  for all
  using (exists (select 1 from public.note n where n.id = flashcard.note and n.owner = auth.uid()))
  with check (exists (select 1 from public.note n where n.id = flashcard.note and n.owner = auth.uid()));

create policy quiz_item_owner on public.quiz_item
  for all
  using (exists (select 1 from public.note n where n.id = quiz_item.note and n.owner = auth.uid()))
  with check (exists (select 1 from public.note n where n.id = quiz_item.note and n.owner = auth.uid()));

-- share: the owner manages it; anyone may read a live one. Reading the row is what lets an
-- unauthenticated visitor resolve /s/:id to a note.
create policy share_owner on public.share
  for all using (auth.uid() = owner) with check (auth.uid() = owner);

create policy share_public_read on public.share
  for select
  to anon, authenticated
  using (revoked = false and (expires_at is null or expires_at > now()));

-- A shared note is readable by anyone holding a live share row.
create policy note_shared_read on public.note
  for select
  to anon, authenticated
  using (exists (
    select 1 from public.share s
    where s.note = note.id and s.revoked = false and (s.expires_at is null or s.expires_at > now())
  ));

-- usage_event: you can see your own ledger (the quota meter reads it). Writes are service-role.
create policy usage_event_own_read on public.usage_event
  for select using (auth.uid() is not null and auth.uid() = owner);

-- daily_cost and app_config: no policies at all. RLS is on, so the anon and authenticated roles
-- get nothing; only the service role (which bypasses RLS) can read or write them.

-- ---------------------------------------------------------------------------
-- app_config seed — quotas, caps, kill switch (02-ARCHITECTURE.md §7).
-- Editable in production without a deploy; that is the point.
-- ---------------------------------------------------------------------------
insert into public.app_config (key, value) values

  -- Layer 3, the kill switch. Flip to false to disable every shared-key call instantly.
  ('enhance_enabled', 'true'::jsonb),

  -- Layer 2, the hard global cap. ~8 CNY/day ≈ 240/month, comfortable headroom over the
  -- ~82 CNY/month pessimistic estimate. BYOK is unaffected by this.
  ('daily_cap_cny', '8'::jsonb),

  -- Alert at 60% and 90% of the cap.
  ('alert_thresholds', '[0.6, 0.9]'::jsonb),

  -- Layer 1, per-user daily quota. Soft and tunable.
  ('quota', $json${
    "anon":     { "enhance_per_day": 3,  "regen_fraction": 0.25, "ocr_per_day": 3 },
    "verified": { "enhance_per_day": 20, "regen_fraction": 0.25, "ocr_per_day": 20 },
    "byok":     { "enhance_per_day": 1000 }
  }$json$::jsonb),

  ('credit_weights', $json${
    "tidy": 0.6, "complete": 1.0, "study_guide": 1.4, "ocr_page": 0.15, "regen": 0.25
  }$json$::jsonb),

  -- CNY per million tokens. VERIFY AGAINST LIVE PROVIDER PRICING BEFORE PRODUCTION and update
  -- this row rather than the code — the ledger and the cost estimates both read it.
  -- Seeded from 02-ARCHITECTURE.md §7 ($0.14 / $0.28 per M tok for flash, at ~7.1 CNY/USD).
  ('pricing', $json${
    "deepseek-v4-flash":   { "in": 1.0,  "out": 2.0,  "cached_in_divisor": 50 },
    "deepseek-v4-pro":     { "in": 4.0,  "out": 8.0,  "cached_in_divisor": 50 },
    "deepseek-vision-exp": { "in": 1.0,  "out": 2.0,  "cached_in_divisor": 50 },
    "gemini-2.5-flash":      { "in": 0.0, "out": 0.0, "cached_in_divisor": 1 },
    "gemini-2.5-flash-lite": { "in": 0.0, "out": 0.0, "cached_in_divisor": 1 }
  }$json$::jsonb),

  ('models', $json${
    "primary":  "deepseek-v4-flash",
    "verify":   "deepseek-v4-pro",
    "vision":   "deepseek-vision-exp",
    "fallback": "gemini-2.5-flash"
  }$json$::jsonb),

  -- Abuse control and input caps (§7 layer 3).
  ('limits', $json${
    "max_chars": 60000,
    "max_pages": 60,
    "max_bytes": 26214400,
    "max_tokens": { "tidy": 4000, "complete": 8000, "study_guide": 10000, "verify": 3000, "detect": 300, "ocr": 4000 },
    "anon_lifetime_calls": 15,
    "ip_calls_per_hour": 20
  }$json$::jsonb),

  -- Which domain families get the Stage C verification pass (04-AI-ENGINE.md §6).
  ('verify_families', '["stem-quantitative", "stem-descriptive"]'::jsonb),

  ('feature_flags', $json${
    "ocr_enabled": true,
    "notion_enabled": false,
    "drive_enabled": false,
    "gemini_optin_enabled": false
  }$json$::jsonb);
