-- =====================================================================
-- SpinDeck — Favorite Parts migration
-- =====================================================================
-- Adds the "favorite part of a song" feature:
--
--   * `song_favorite_parts` (NEW) — per-user, per-track personal favorite
--     range. Mirrors the data model of `notes` for the SongView side:
--     each user can pin one favorite range for a Spotify track id, and
--     that's what NowPlayingBar / SongView show as their highlight.
--
--   * `app_playlist_songs.favorite_start_ms` / `favorite_end_ms` (NEW
--     columns) — owner-set favorite range, attached to a song *within
--     a SpinDeck-native playlist*. Pairs with the existing `annotation`
--     column. Surfaces in AppSongView and as an indicator on
--     AppPlaylistView rows.
--
-- Run this in the Supabase SQL editor (or via `supabase db push`)
-- AFTER the v1 schema.sql is in place.
-- =====================================================================


-- ---------------------------------------------------------------------
-- song_favorite_parts
-- ---------------------------------------------------------------------
-- One row per (user, track). The composite PK makes upsert cheap and
-- guarantees no duplicates. start_ms / end_ms are stored as integers
-- (Spotify gives us track durations in ms, the SDK seeks in ms).
-- A pair where start >= end is meaningless, so we enforce ordering
-- at the row level too.
create table if not exists public.song_favorite_parts (
  user_id            uuid not null references public.app_users(id) on delete cascade,
  spotify_track_id   text not null,
  start_ms           integer not null check (start_ms >= 0),
  end_ms             integer not null check (end_ms > start_ms),
  updated_at         timestamptz not null default now(),
  primary key (user_id, spotify_track_id)
);

-- Track-id index so future "X people have a favorite part on this song"
-- queries don't tablescan. Also keeps the per-track lookup that the
-- player will eventually use cheap.
create index if not exists song_favorite_parts_track_idx
  on public.song_favorite_parts (spotify_track_id);


-- ---------------------------------------------------------------------
-- RLS — same posture as song_favorites.
-- ---------------------------------------------------------------------
-- Reads are public so we can render aggregates / surface other users'
-- favorite parts in future. Writes are strictly self-only.
alter table public.song_favorite_parts enable row level security;

create policy "song_favorite_parts: public read"
  on public.song_favorite_parts for select
  using (true);

create policy "song_favorite_parts: self insert"
  on public.song_favorite_parts for insert
  with check (user_id = auth.uid());

create policy "song_favorite_parts: self update"
  on public.song_favorite_parts for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "song_favorite_parts: self delete"
  on public.song_favorite_parts for delete
  using (user_id = auth.uid());


-- Bump updated_at on every UPDATE. Same trigger function we already
-- use on app_playlists; create-if-missing in case this migration runs
-- on a DB where the function isn't defined yet.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists song_favorite_parts_touch_updated_at
  on public.song_favorite_parts;
create trigger song_favorite_parts_touch_updated_at
  before update on public.song_favorite_parts
  for each row execute function public.touch_updated_at();


-- ---------------------------------------------------------------------
-- app_playlist_songs — add owner-set favorite-part columns
-- ---------------------------------------------------------------------
-- Both nullable — not every song has to have a favorite part. The
-- check constraint enforces the same start < end invariant when both
-- are set. We allow either-both-null or both-non-null; setting only
-- one is meaningless and rejected.
alter table public.app_playlist_songs
  add column if not exists favorite_start_ms integer,
  add column if not exists favorite_end_ms   integer;

-- Use a named CHECK constraint so re-running the migration is clean
-- (drop-if-exists then add).
alter table public.app_playlist_songs
  drop constraint if exists app_playlist_songs_favorite_part_chk;

alter table public.app_playlist_songs
  add constraint app_playlist_songs_favorite_part_chk
  check (
    (favorite_start_ms is null and favorite_end_ms is null)
    or (
      favorite_start_ms is not null
      and favorite_end_ms is not null
      and favorite_start_ms >= 0
      and favorite_end_ms > favorite_start_ms
    )
  );


-- =====================================================================
-- Done. Existing RLS on app_playlist_songs already gates writes to the
-- playlist owner, so the new columns inherit that — only the playlist
-- owner can set / clear the favorite part.
-- =====================================================================
