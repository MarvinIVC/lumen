-- ---------------------------------------------------------------------------
-- Phase-07 — public share links and the Notion / Drive integrations.
--
-- Two things here are load-bearing and easy to undo by accident.
--
-- `0003` dropped `note_shared_read` and then revoked every grant on `note` from
-- `anon`, so the public read path a share link needs does not exist at all — and
-- a policy alone would not restore it, because grants are checked first. Rather
-- than give `anon` a grant on `note` and rely on a policy to narrow it, the
-- whole public surface is one security-definer function returning exactly the
-- columns a share page renders. `anon` keeps zero access to the table.
--
-- `integration.token_ciphertext` is written and read only by the edge functions
-- with the service role, the same way `profile.byok` is. `authenticated` gets
-- column grants that exclude it, so a signed-in browser cannot read its own
-- Notion token back out.
-- ---------------------------------------------------------------------------

-- The OG card for a share, in a public bucket, plus the counters the public
-- route is rate-limited by.
alter table public.share
  add column if not exists og_path text,
  add column if not exists views bigint not null default 0,
  add column if not exists last_viewed_at timestamptz;

create index if not exists share_owner_idx on public.share (owner, created_at desc);

-- ---------------------------------------------------------------------------
-- Rate limiting for the public route, in minute buckets.
--
-- It lives in the database rather than at the edge because the share read is
-- already one round trip to Postgres, so the counter is free — and because a
-- limit the Worker enforces is a limit that disappears the moment anything
-- reaches the function another way.
-- ---------------------------------------------------------------------------
create table if not exists public.share_hit (
  share text not null references public.share (id) on delete cascade,
  minute timestamptz not null,
  hits int not null default 0,
  primary key (share, minute)
);

alter table public.share_hit enable row level security;
revoke all on table public.share_hit from anon, authenticated;

-- ---------------------------------------------------------------------------
-- The whole public surface of a shared note.
--
-- `security definer` so it can read `note` without `anon` holding any grant on
-- it. It returns the document and the title and nothing else: no owner, no
-- email, no ids that could be walked. 06 §4 — "no owner PII on the page".
--
-- Revoke and expiry are evaluated here, on every read, which is what makes
-- "revoked within seconds" true rather than aspirational. The share page is
-- `force-dynamic` for the same reason: phase-02's incremental cache cannot
-- revalidate, so a cached share page could never be withdrawn.
-- ---------------------------------------------------------------------------
create or replace function public.shared_note(p_share_id text, p_limit int default 240)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  share_row public.share%rowtype;
  note_row public.note%rowtype;
  bucket timestamptz := date_trunc('minute', now());
  current_hits int;
begin
  select * into share_row from public.share where id = p_share_id;

  -- One answer for "no such link", "revoked" and "expired". A distinguishable
  -- 'revoked' would confirm to a stranger that the link had once been real.
  if not found or share_row.revoked
     or (share_row.expires_at is not null and share_row.expires_at <= now()) then
    return jsonb_build_object('ok', false);
  end if;

  insert into public.share_hit (share, minute, hits)
  values (share_row.id, bucket, 1)
  on conflict (share, minute) do update set hits = public.share_hit.hits + 1
  returning hits into current_hits;

  if current_hits > p_limit then
    return jsonb_build_object('ok', false, 'throttled', true);
  end if;

  select * into note_row from public.note where id = share_row.note;
  if not found then
    return jsonb_build_object('ok', false);
  end if;

  update public.share
    set views = views + 1, last_viewed_at = now()
    where id = share_row.id;

  return jsonb_build_object(
    'ok', true,
    'title', note_row.title,
    'doc', note_row.doc,
    'subject', note_row.subject,
    'curriculum', note_row.curriculum,
    'allowIndex', share_row.allow_index,
    'ogPath', share_row.og_path,
    'createdAt', share_row.created_at
  );
end;
$$;

revoke execute on function public.shared_note(text, int) from public;
grant execute on function public.shared_note(text, int) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- The share row itself becomes private, now that nothing public reads it.
--
-- `0003`'s `share_public_read` let anyone holding a link select the row, which
-- carries `note` and `owner` — so a stranger with one link could read the
-- owner's user id, and two links could be correlated to the same person. That
-- policy existed because the original design had the share page read the row
-- directly; it reads `shared_note()` instead, which is `security definer` and
-- needs no policy at all. So the public surface is the function and nothing
-- else, which is also the only version of this that is easy to reason about.
--
-- Found by `pnpm test:share` asking for the row as a stranger.
-- ---------------------------------------------------------------------------
drop policy if exists share_public_read on public.share;
revoke all on table public.share from anon;

-- ---------------------------------------------------------------------------
-- The OG cards. Public, because a link preview is fetched by a crawler that
-- carries no session — a signed URL would expire and the preview would rot.
-- The share id is the unguessable part, and the card is a rendering of the
-- note's own first section, which the link already discloses.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('share-cards', 'share-cards', true, 2097152, array['image/png'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists share_cards_public_read on storage.objects;
create policy share_cards_public_read on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'share-cards');

-- Writing a card is the service role's job, from the route that creates the
-- share. A browser that could write here could replace any note's card.

-- ---------------------------------------------------------------------------
-- Integration tokens stay out of reach of the browser that owns them.
--
-- Phase-06 #8, applied to the second secret this product holds: a policy alone
-- would let a signed-in browser select its own `token_ciphertext`, which is
-- exactly what the encryption is supposed to prevent. `meta` is readable
-- because the UI needs to show which workspace and folder a note will land in.
-- ---------------------------------------------------------------------------
alter table public.integration
  add column if not exists refresh_ciphertext text,
  add column if not exists expires_at timestamptz,
  add column if not exists account_label text,
  add column if not exists revoked boolean not null default false;

alter table public.integration
  drop constraint if exists integration_owner_kind_key,
  add constraint integration_owner_kind_key unique (owner, kind);

revoke select, insert, update, delete on table public.integration from authenticated;
grant select (id, owner, kind, meta, account_label, revoked, created_at, updated_at)
  on table public.integration to authenticated;
grant update (meta) on table public.integration to authenticated;
grant delete on table public.integration to authenticated;
