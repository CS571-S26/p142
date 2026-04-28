-- =====================================================================
-- 005 — Saved (bookmarked) playlists.
-- =====================================================================
-- Lets a signed-in user "save" any annotated playlist they have a link
-- to. Saving = following: the row in saved_playlists is just a pointer.
-- Edits the owner makes (track adds/removes, annotations, name, vinyl
-- color) propagate live, since viewers always read the canonical row.
--
-- One row per (user, playlist). ON DELETE CASCADE on both FKs so
-- deleting a playlist or a user account cleans up automatically.
--
-- RLS: users can read / insert / delete only their own bookmarks.
-- Nothing here is public — anonymous viewers see the playlist via the
-- existing app_playlists policy, but can't save until they sign up.
-- =====================================================================

create table if not exists public.saved_playlists (
  user_id     uuid not null references public.app_users(id) on delete cascade,
  playlist_id uuid not null references public.app_playlists(id) on delete cascade,
  saved_at    timestamptz not null default now(),
  primary key (user_id, playlist_id)
);

-- Common access pattern: "list everything user X has saved, newest first"
create index if not exists saved_playlists_user_idx
  on public.saved_playlists (user_id, saved_at desc);

alter table public.saved_playlists enable row level security;

-- Users can see their own saves. We don't expose "who saved this
-- playlist" to the owner yet — that's a follower-list feature for later.
drop policy if exists "saved_playlists_select_own" on public.saved_playlists;
create policy "saved_playlists_select_own"
  on public.saved_playlists
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "saved_playlists_insert_own" on public.saved_playlists;
create policy "saved_playlists_insert_own"
  on public.saved_playlists
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "saved_playlists_delete_own" on public.saved_playlists;
create policy "saved_playlists_delete_own"
  on public.saved_playlists
  for delete
  to authenticated
  using (user_id = auth.uid());
