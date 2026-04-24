-- =====================================================================
-- SpinDeck — Supabase schema (v1)
-- =====================================================================
-- Two-mode architecture:
--   1. Public Mode     — pseudonymous app users with unique usernames.
--                        Auth is Supabase anonymous sign-in; username is
--                        captured on first load and stored in app_users.
--   2. Spotify-Linked  — optional Spotify account link on top of an app
--                        user. Gives in-app playback + sync with the
--                        user's Spotify playlists. Limited to allowlisted
--                        users while the Spotify app is in dev mode.
--
-- Every user is first an `app_users` row. Linking Spotify attaches a
-- `spotify_links` row. Notes, favorites, and app-native playlists all
-- work whether or not Spotify is connected.
--
-- Paste this into the Supabase dashboard SQL editor for the project, or
-- feed it through `supabase db push` once we move to a CLI-driven setup.
-- =====================================================================


-- ---------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------
create extension if not exists "pgcrypto";  -- gen_random_uuid()
create extension if not exists "citext";    -- case-insensitive username


-- =====================================================================
-- Tables
-- =====================================================================

-- ---------------------------------------------------------------------
-- app_users
-- ---------------------------------------------------------------------
-- One row per SpinDeck user. `id` mirrors auth.users.id so RLS can use
-- auth.uid() directly. Anonymous sign-in creates the auth.users row;
-- this table holds the app-level profile (username, vinyl color, etc).
create table public.app_users (
  id            uuid primary key references auth.users(id) on delete cascade,
  username      citext not null unique
                  check (
                    char_length(username) between 3 and 24
                    and username ~ '^[A-Za-z0-9_]+$'
                  ),
  display_name  text,
  vinyl_color   text not null default '#1a1a2e',
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- spotify_links
-- ---------------------------------------------------------------------
-- Optional: attached when a user connects their Spotify account. The
-- refresh_token should eventually live in Supabase Vault / pgsodium;
-- for dev we store it raw but keep the column nullable so we can
-- migrate later without data loss.
create table public.spotify_links (
  app_user_id       uuid primary key references public.app_users(id) on delete cascade,
  spotify_user_id   text not null unique,
  refresh_token     text,
  linked_at         timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- app_playlists
-- ---------------------------------------------------------------------
-- Playlists created natively inside SpinDeck (not synced from Spotify).
create table public.app_playlists (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references public.app_users(id) on delete cascade,
  name          text not null check (char_length(name) between 1 and 80),
  description   text not null default '',
  vinyl_color   text not null default '#1a1a2e',
  is_public     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index app_playlists_owner_idx  on public.app_playlists (owner_id);
create index app_playlists_public_idx on public.app_playlists (is_public) where is_public;

-- ---------------------------------------------------------------------
-- app_playlist_songs
-- ---------------------------------------------------------------------
-- Songs inside an app-native playlist. We store the Spotify track id
-- plus a cached snapshot of the track metadata we actually display
-- (title, artist, album, cover art, duration). That cache is populated
-- at *add* time using the owner's personal Spotify token, and lets
-- anyone — including Public-Mode users with no Spotify login — view
-- annotated playlists without a single API call.
--
-- (Why not fetch on demand? Spotify's dev-mode migration blocks the
-- Client Credentials flow from /v1/tracks and /v1/search, so an Edge
-- Function proxy isn't a workable fallback until an app reaches
-- extended-quota mode.)
--
-- Composite PK (playlist_id, position) makes insert-at-index and
-- reorder operations straightforward.
create table public.app_playlist_songs (
  playlist_id        uuid not null references public.app_playlists(id) on delete cascade,
  position           integer not null check (position >= 0),
  spotify_track_id   text not null,
  added_by           uuid references public.app_users(id) on delete set null,
  added_at           timestamptz not null default now(),
  -- Owner annotation attached to this song *in this playlist*. Nullable
  -- (not every song has to have one). Upper bound matches notes.body.
  annotation         text
                       check (annotation is null or char_length(annotation) between 1 and 2000),
  -- Cached track metadata (nullable for rows that predate the cache).
  title              text,
  artist             text,
  album              text,
  album_art_url      text,
  duration_ms        integer check (duration_ms is null or duration_ms >= 0),
  primary key (playlist_id, position)
);
create index app_playlist_songs_track_idx on public.app_playlist_songs (spotify_track_id);

-- ---------------------------------------------------------------------
-- notes
-- ---------------------------------------------------------------------
-- Notes are polymorphic — they can attach to:
--   * a song              (target_id = Spotify track id)
--   * an app playlist     (target_id = app_playlists.id cast to text)
--   * a Spotify playlist  (target_id = Spotify playlist id)
-- We key reads by (target_type, target_id) so one table handles all
-- three attachment kinds.
create type public.note_target as enum ('song', 'app_playlist', 'spotify_playlist');

create table public.notes (
  id            uuid primary key default gen_random_uuid(),
  author_id     uuid not null references public.app_users(id) on delete cascade,
  target_type   public.note_target not null,
  target_id     text not null,
  body          text not null check (char_length(body) between 1 and 2000),
  created_at    timestamptz not null default now()
);
create index notes_target_idx on public.notes (target_type, target_id, created_at desc);
create index notes_author_idx on public.notes (author_id);

-- ---------------------------------------------------------------------
-- song_favorites
-- ---------------------------------------------------------------------
-- Heart button on songs. Composite PK prevents duplicates and makes
-- toggling cheap (a single delete, or a single upsert).
create table public.song_favorites (
  user_id            uuid not null references public.app_users(id) on delete cascade,
  spotify_track_id   text not null,
  favorited_at       timestamptz not null default now(),
  primary key (user_id, spotify_track_id)
);
create index song_favorites_track_idx on public.song_favorites (spotify_track_id);


-- =====================================================================
-- Triggers
-- =====================================================================

-- Keep app_playlists.updated_at honest on every UPDATE.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger app_playlists_touch_updated_at
  before update on public.app_playlists
  for each row execute function public.touch_updated_at();


-- Auto-create an app_users profile row whenever a new auth.users row is
-- inserted. The client passes `username` (and optional `display_name`)
-- via auth.signUp's `options.data`, which Supabase stores on
-- auth.users.raw_user_meta_data. Doing this in a DB trigger (instead of
-- in the client after signUp) means the profile is always created, even
-- when email confirmation is enabled and signUp returns no session.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username     text;
  v_display_name text;
begin
  v_username     := new.raw_user_meta_data->>'username';
  v_display_name := new.raw_user_meta_data->>'display_name';

  -- No-op for auth users that aren't SpinDeck sign-ups (no username in
  -- metadata). Keeps the trigger safe against other auth flows.
  if v_username is null or length(v_username) = 0 then
    return new;
  end if;

  insert into public.app_users (id, username, display_name)
  values (new.id, v_username, nullif(v_display_name, ''));

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();


-- =====================================================================
-- Row-Level Security
-- =====================================================================
-- Guiding principles:
--   * Reads are generous (the app is social: profiles, public playlists,
--     notes, and favorite counts are visible to everyone).
--   * Writes are strictly self-only (auth.uid() = author/owner).
--   * Private playlists are opaque to non-owners.
-- =====================================================================

alter table public.app_users          enable row level security;
alter table public.spotify_links      enable row level security;
alter table public.app_playlists      enable row level security;
alter table public.app_playlist_songs enable row level security;
alter table public.notes              enable row level security;
alter table public.song_favorites     enable row level security;


-- ---- app_users ------------------------------------------------------
create policy "app_users: public read"
  on public.app_users for select
  using (true);

create policy "app_users: self insert"
  on public.app_users for insert
  with check (id = auth.uid());

create policy "app_users: self update"
  on public.app_users for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- No delete policy — users don't delete their own app_users row
-- directly; deletion cascades from auth.users if we ever wire that up.


-- ---- spotify_links --------------------------------------------------
-- The link row contains a refresh token, so only the owner may read it.
create policy "spotify_links: self read"
  on public.spotify_links for select
  using (app_user_id = auth.uid());

create policy "spotify_links: self insert"
  on public.spotify_links for insert
  with check (app_user_id = auth.uid());

create policy "spotify_links: self update"
  on public.spotify_links for update
  using (app_user_id = auth.uid())
  with check (app_user_id = auth.uid());

create policy "spotify_links: self delete"
  on public.spotify_links for delete
  using (app_user_id = auth.uid());


-- ---- app_playlists --------------------------------------------------
create policy "app_playlists: read if public or owner"
  on public.app_playlists for select
  using (is_public or owner_id = auth.uid());

create policy "app_playlists: owner insert"
  on public.app_playlists for insert
  with check (owner_id = auth.uid());

create policy "app_playlists: owner update"
  on public.app_playlists for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "app_playlists: owner delete"
  on public.app_playlists for delete
  using (owner_id = auth.uid());


-- ---- app_playlist_songs --------------------------------------------
-- Readable iff parent playlist is readable (public or owned).
create policy "app_playlist_songs: read via parent"
  on public.app_playlist_songs for select
  using (
    exists (
      select 1 from public.app_playlists p
      where p.id = app_playlist_songs.playlist_id
        and (p.is_public or p.owner_id = auth.uid())
    )
  );

-- Only the playlist owner can add / remove / reorder songs.
create policy "app_playlist_songs: owner insert"
  on public.app_playlist_songs for insert
  with check (
    exists (
      select 1 from public.app_playlists p
      where p.id = app_playlist_songs.playlist_id
        and p.owner_id = auth.uid()
    )
  );

create policy "app_playlist_songs: owner update"
  on public.app_playlist_songs for update
  using (
    exists (
      select 1 from public.app_playlists p
      where p.id = app_playlist_songs.playlist_id
        and p.owner_id = auth.uid()
    )
  );

create policy "app_playlist_songs: owner delete"
  on public.app_playlist_songs for delete
  using (
    exists (
      select 1 from public.app_playlists p
      where p.id = app_playlist_songs.playlist_id
        and p.owner_id = auth.uid()
    )
  );


-- ---- notes ----------------------------------------------------------
create policy "notes: public read"
  on public.notes for select
  using (true);

create policy "notes: self insert"
  on public.notes for insert
  with check (author_id = auth.uid());

create policy "notes: self update"
  on public.notes for update
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

create policy "notes: self delete"
  on public.notes for delete
  using (author_id = auth.uid());


-- ---- song_favorites -------------------------------------------------
-- Public read so we can render aggregate favorite counts anywhere.
create policy "song_favorites: public read"
  on public.song_favorites for select
  using (true);

create policy "song_favorites: self insert"
  on public.song_favorites for insert
  with check (user_id = auth.uid());

create policy "song_favorites: self delete"
  on public.song_favorites for delete
  using (user_id = auth.uid());


-- =====================================================================
-- Helper views
-- =====================================================================

-- Per-track aggregate counts for the song-first home feed. Cheap to
-- select against; backed by indexes on notes(target_type, target_id)
-- and song_favorites(spotify_track_id).
create or replace view public.song_stats as
with tracks as (
  select spotify_track_id from public.song_favorites
  union
  select target_id as spotify_track_id from public.notes where target_type = 'song'
),
note_counts as (
  select target_id, count(*)::int as note_count
  from public.notes
  where target_type = 'song'
  group by target_id
),
fav_counts as (
  select spotify_track_id, count(*)::int as favorite_count
  from public.song_favorites
  group by spotify_track_id
)
select
  t.spotify_track_id,
  coalesce(n.note_count, 0)     as note_count,
  coalesce(f.favorite_count, 0) as favorite_count
from tracks t
left join note_counts n on n.target_id        = t.spotify_track_id
left join fav_counts  f on f.spotify_track_id = t.spotify_track_id;


-- =====================================================================
-- RPC: email_for_username
-- =====================================================================
-- Lets the sign-in form accept either a username or an email. The
-- client checks for "@" — if not present, calls this RPC to resolve
-- username → email, then passes that into signInWithPassword.
--
-- SECURITY DEFINER because unauthenticated visitors need to call it
-- (that's the whole point of sign-in). Runs as the owner, which can
-- see auth.users. search_path is locked down defensively.

create or replace function public.email_for_username(p_username text)
returns text
language sql
security definer
set search_path = public, auth
stable
as $$
  select u.email
  from auth.users u
  join public.app_users a on a.id = u.id
  where a.username = p_username
  limit 1
$$;

grant execute on function public.email_for_username(text) to anon, authenticated;


-- =====================================================================
-- Seed data (optional, comment out before running in prod)
-- =====================================================================
-- No seeds — users are created through the app's sign-up flow.
