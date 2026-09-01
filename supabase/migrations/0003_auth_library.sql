-- ---------------------------------------------------------------------------
-- Phase-06 — accounts, the cloud library and conflict-safe sync.
--
-- Local storage remains the source of truth while the browser is offline. The
-- cloud copy is updated through `sync_note`, which compares the revision the
-- browser last observed with the row it locks. A stale writer never overwrites
-- another device: its whole document becomes a conflicted sibling instead.
-- ---------------------------------------------------------------------------

-- Stable client ids make the first signed-in merge idempotent. Courses also
-- need an ordinal: phase-00's schema gave units one but left courses impossible
-- to reorder without encoding order in their names.
alter table public.course
  add column if not exists local_id text,
  add column if not exists ordinal int not null default 0,
  add column if not exists updated_at timestamptz not null default now();

alter table public.unit
  add column if not exists local_id text,
  add column if not exists updated_at timestamptz not null default now();

-- Plain unique constraints (rather than partial indexes) let PostgREST's
-- `on_conflict=owner,local_id` infer the arbiter. Postgres still permits any
-- number of null values, so legacy rows are unaffected.
alter table public.course
  drop constraint if exists course_owner_local_id_key,
  add constraint course_owner_local_id_key unique (owner, local_id);
alter table public.unit
  drop constraint if exists unit_course_local_id_key,
  add constraint unit_course_local_id_key unique (course, local_id);
create index if not exists course_owner_ordinal_idx on public.course (owner, ordinal, created_at);

-- `updated_at` is the server clock; `client_updated_at` is the last local edit
-- the browser reports. `sync_revision` is the compare-and-swap value and avoids
-- treating two clocks on two school laptops as though they were comparable.
alter table public.note
  alter column owner set not null,
  add column if not exists client_updated_at timestamptz not null default now(),
  add column if not exists sync_revision bigint not null default 1,
  add column if not exists last_device_id text,
  add column if not exists edited boolean not null default false,
  add column if not exists thumbnail_path text,
  add column if not exists exported_at timestamptz,
  add column if not exists notion_synced_at timestamptz,
  add column if not exists conflict_of uuid references public.note (id) on delete set null,
  add column if not exists conflict_status text
    check (conflict_status is null or conflict_status in ('unresolved', 'resolved')),
  add column if not exists search_text text not null default '';

alter table public.note
  add column if not exists search_vector tsvector generated always as (
    setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(search_text, '')), 'B')
  ) stored;

create index if not exists note_search_vector_idx on public.note using gin (search_vector);
create index if not exists note_conflict_of_idx on public.note (conflict_of)
  where conflict_of is not null;

-- The original trigger only touched a timestamp. Revisions advance in the same
-- transaction, so two outbox drains cannot both believe they won.
drop trigger if exists note_touch_updated_at on public.note;

create or replace function public.touch_note_sync()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = clock_timestamp();
  new.sync_revision = old.sync_revision + 1;
  return new;
end;
$$;

create trigger note_touch_updated_at
  before update on public.note
  for each row execute function public.touch_note_sync();

drop trigger if exists course_touch_updated_at on public.course;
create trigger course_touch_updated_at
  before update on public.course
  for each row execute function public.touch_updated_at();

drop trigger if exists unit_touch_updated_at on public.unit;
create trigger unit_touch_updated_at
  before update on public.unit
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- RLS — browser requests always carry the user's JWT. The service role remains
-- reserved for edge functions and account deletion.
-- ---------------------------------------------------------------------------

drop policy if exists profile_select on public.profile;
drop policy if exists profile_update on public.profile;
drop policy if exists profile_insert on public.profile;
drop policy if exists course_owner on public.course;
drop policy if exists unit_owner on public.unit;
drop policy if exists note_owner on public.note;
drop policy if exists note_shared_read on public.note;
drop policy if exists note_asset_owner on public.note_asset;
drop policy if exists flashcard_owner on public.flashcard;
drop policy if exists quiz_item_owner on public.quiz_item;
drop policy if exists share_owner on public.share;
drop policy if exists share_public_read on public.share;
drop policy if exists integration_owner on public.integration;
drop policy if exists usage_event_own_read on public.usage_event;

create policy profile_select on public.profile
  for select to authenticated using ((select auth.uid()) = id);
create policy profile_update on public.profile
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy course_owner on public.course
  for all to authenticated
  using ((select auth.uid()) = owner)
  with check ((select auth.uid()) = owner);

create policy unit_owner on public.unit
  for all to authenticated
  using (exists (
    select 1 from public.course c
    where c.id = unit.course and c.owner = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.course c
    where c.id = unit.course and c.owner = (select auth.uid())
  ));

create policy note_owner on public.note
  for all to authenticated
  using ((select auth.uid()) = owner)
  with check ((select auth.uid()) = owner);

create policy note_asset_owner on public.note_asset
  for all to authenticated
  using (exists (
    select 1 from public.note n
    where n.id = note_asset.note and n.owner = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.note n
    where n.id = note_asset.note and n.owner = (select auth.uid())
  ));

create policy flashcard_owner on public.flashcard
  for all to authenticated
  using (exists (
    select 1 from public.note n
    where n.id = flashcard.note and n.owner = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.note n
    where n.id = flashcard.note and n.owner = (select auth.uid())
  ));

create policy quiz_item_owner on public.quiz_item
  for all to authenticated
  using (exists (
    select 1 from public.note n
    where n.id = quiz_item.note and n.owner = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.note n
    where n.id = quiz_item.note and n.owner = (select auth.uid())
  ));

create policy integration_owner on public.integration
  for all to authenticated
  using ((select auth.uid()) = owner)
  with check ((select auth.uid()) = owner);

create policy share_owner on public.share
  for all to authenticated
  using ((select auth.uid()) = owner)
  with check ((select auth.uid()) = owner);

create policy share_public_read on public.share
  for select to anon, authenticated
  using (revoked = false and (expires_at is null or expires_at > now()));

create policy usage_event_own_read on public.usage_event
  for select to authenticated
  using ((select auth.uid()) = owner);

-- Column grants stop an authenticated browser selecting or replacing the BYOK
-- ciphertext. The account endpoints move it with the service role instead.
revoke all on table public.profile from anon;
revoke select, insert, update, delete on table public.profile from authenticated;
grant select (id, display_name, locale, prefs, created_at) on public.profile to authenticated;
grant update (display_name, locale, prefs) on public.profile to authenticated;

revoke all on table public.app_config, public.daily_cost from anon, authenticated;
revoke all on table public.usage_event from anon, authenticated;
grant select on table public.usage_event to authenticated;

revoke all on table public.course, public.unit, public.note, public.note_asset,
  public.flashcard, public.quiz_item, public.integration from anon;

-- ---------------------------------------------------------------------------
-- Private note assets. Paths are `<auth.uid()>/<note local id>/<asset>`.
-- Storage ownership is enforced both by the path and by owner_id.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'note-assets',
  'note-assets',
  false,
  5242880,
  array['image/svg+xml', 'image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists note_assets_select on storage.objects;
drop policy if exists note_assets_insert on storage.objects;
drop policy if exists note_assets_update on storage.objects;
drop policy if exists note_assets_delete on storage.objects;

create policy note_assets_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'note-assets'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy note_assets_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'note-assets'
    and owner_id = (select auth.uid())::text
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy note_assets_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'note-assets'
    and owner_id = (select auth.uid())::text
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'note-assets'
    and owner_id = (select auth.uid())::text
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy note_assets_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'note-assets'
    and owner_id = (select auth.uid())::text
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- ---------------------------------------------------------------------------
-- One atomic note push. Accepted edits replace the whole blob. A stale edit is
-- preserved as a sibling instead of being silently discarded.
-- ---------------------------------------------------------------------------

create or replace function public.sync_note(
  p_local_id text,
  p_base_revision bigint,
  p_client_updated_at timestamptz,
  p_device_id text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_note public.note%rowtype;
  written_note public.note%rowtype;
  conflict_local_id text;
begin
  if (select auth.uid()) is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if nullif(trim(p_local_id), '') is null then
    raise exception 'local id required' using errcode = '22023';
  end if;

  select * into current_note
  from public.note
  where owner = (select auth.uid()) and local_id = p_local_id
  for update;

  if not found then
    insert into public.note (
      owner, unit, course, local_id, title, subject, curriculum, topic, language,
      mode, status, doc, source, stats, created_at, client_updated_at,
      last_device_id, edited, thumbnail_path, search_text
    ) values (
      (select auth.uid()),
      nullif(p_payload ->> 'unit', '')::uuid,
      nullif(p_payload ->> 'course', '')::uuid,
      p_local_id,
      coalesce(nullif(p_payload ->> 'title', ''), 'Untitled'),
      nullif(p_payload ->> 'subject', ''),
      nullif(p_payload ->> 'curriculum', ''),
      nullif(p_payload ->> 'topic', ''),
      coalesce(nullif(p_payload ->> 'language', ''), 'en'),
      nullif(p_payload ->> 'mode', ''),
      coalesce(nullif(p_payload ->> 'status', ''), 'draft'),
      p_payload -> 'doc',
      p_payload -> 'source',
      p_payload -> 'stats',
      coalesce(nullif(p_payload ->> 'createdAt', '')::timestamptz, now()),
      p_client_updated_at,
      p_device_id,
      coalesce((p_payload ->> 'edited')::boolean, false),
      nullif(p_payload ->> 'thumbnailPath', ''),
      coalesce(p_payload ->> 'searchText', '')
    ) returning * into written_note;

    return jsonb_build_object(
      'outcome', 'inserted',
      'id', written_note.id,
      'revision', written_note.sync_revision,
      'updatedAt', written_note.updated_at
    );
  end if;

  -- A first merge has no base revision. The client clock is used only for this
  -- one choice required by the product; every ongoing edit uses the revision.
  if p_base_revision is null and p_client_updated_at <= current_note.client_updated_at then
    return jsonb_build_object(
      'outcome', 'cloud-wins',
      'id', current_note.id,
      'revision', current_note.sync_revision,
      'updatedAt', current_note.updated_at,
      'note', to_jsonb(current_note)
    );
  end if;

  if p_base_revision is null or p_base_revision = current_note.sync_revision then
    update public.note set
      unit = nullif(p_payload ->> 'unit', '')::uuid,
      course = nullif(p_payload ->> 'course', '')::uuid,
      title = coalesce(nullif(p_payload ->> 'title', ''), 'Untitled'),
      subject = nullif(p_payload ->> 'subject', ''),
      curriculum = nullif(p_payload ->> 'curriculum', ''),
      topic = nullif(p_payload ->> 'topic', ''),
      language = coalesce(nullif(p_payload ->> 'language', ''), 'en'),
      mode = nullif(p_payload ->> 'mode', ''),
      status = coalesce(nullif(p_payload ->> 'status', ''), 'draft'),
      doc = p_payload -> 'doc',
      source = p_payload -> 'source',
      stats = p_payload -> 'stats',
      client_updated_at = p_client_updated_at,
      last_device_id = p_device_id,
      edited = coalesce((p_payload ->> 'edited')::boolean, false),
      thumbnail_path = nullif(p_payload ->> 'thumbnailPath', ''),
      search_text = coalesce(p_payload ->> 'searchText', ''),
      conflict_status = null
    where id = current_note.id
    returning * into written_note;

    return jsonb_build_object(
      'outcome', 'applied',
      'id', written_note.id,
      'revision', written_note.sync_revision,
      'updatedAt', written_note.updated_at
    );
  end if;

  conflict_local_id := p_local_id || ':conflict:' || gen_random_uuid()::text;
  insert into public.note (
    owner, unit, course, local_id, title, subject, curriculum, topic, language,
    mode, status, doc, source, stats, created_at, client_updated_at,
    last_device_id, edited, thumbnail_path, search_text, conflict_of, conflict_status
  ) values (
    (select auth.uid()),
    nullif(p_payload ->> 'unit', '')::uuid,
    nullif(p_payload ->> 'course', '')::uuid,
    conflict_local_id,
    coalesce(nullif(p_payload ->> 'title', ''), 'Untitled') || ' (conflicted copy)',
    nullif(p_payload ->> 'subject', ''),
    nullif(p_payload ->> 'curriculum', ''),
    nullif(p_payload ->> 'topic', ''),
    coalesce(nullif(p_payload ->> 'language', ''), 'en'),
    nullif(p_payload ->> 'mode', ''),
    coalesce(nullif(p_payload ->> 'status', ''), 'draft'),
    p_payload -> 'doc',
    p_payload -> 'source',
    p_payload -> 'stats',
    now(),
    p_client_updated_at,
    p_device_id,
    coalesce((p_payload ->> 'edited')::boolean, false),
    nullif(p_payload ->> 'thumbnailPath', ''),
    coalesce(p_payload ->> 'searchText', ''),
    current_note.id,
    'unresolved'
  ) returning * into written_note;

  return jsonb_build_object(
    'outcome', 'conflict',
    'id', current_note.id,
    'revision', current_note.sync_revision,
    'updatedAt', current_note.updated_at,
    'conflictId', written_note.id,
    'conflictLocalId', written_note.local_id
  );
end;
$$;

revoke execute on function public.sync_note(text, bigint, timestamptz, text, jsonb)
  from public, anon;
grant execute on function public.sync_note(text, bigint, timestamptz, text, jsonb)
  to authenticated;

-- Ranked cloud search returns ids only; the library already has the safe card
-- projection and does not download document blobs for a result list.
create or replace function public.search_notes(p_query text, p_limit int default 50)
returns table (note_id uuid, rank real)
language sql
stable
security invoker
set search_path = public
as $$
  with query as (
    select websearch_to_tsquery('simple', trim(p_query)) as value
  )
  select
    n.id,
    greatest(
      ts_rank(n.search_vector, query.value),
      case when n.title ilike '%' || p_query || '%' then 0.2 else 0 end,
      case when n.search_text ilike '%' || p_query || '%' then 0.1 else 0 end
    )::real as rank
  from public.note n, query
  where n.owner = (select auth.uid())
    and nullif(trim(p_query), '') is not null
    and (
      n.search_vector @@ query.value
      or n.title ilike '%' || p_query || '%'
      or n.search_text ilike '%' || p_query || '%'
    )
  order by rank desc, n.updated_at desc
  limit least(greatest(p_limit, 1), 100);
$$;

revoke execute on function public.search_notes(text, int) from public, anon;
grant execute on function public.search_notes(text, int) to authenticated;
