-- =====================================================================
-- 007 — Imported-from-Spotify lineage on app_playlists.
-- =====================================================================
-- We let users "Share with SpinDeck" any Spotify-sourced playlist they
-- can see. That action imports the playlist as a one-time snapshot into
-- app_playlists (reusing all of SpinDeck's existing share / save /
-- invite plumbing). The original Spotify playlist is untouched and is
-- NOT kept in sync — re-importing later won't re-pull tracks.
--
-- To avoid users accidentally creating dozens of duplicate snapshots
-- when they click "Share with SpinDeck" twice, we remember which
-- Spotify playlist (if any) each app_playlist row was imported from.
-- A second import attempt for the same (owner, spotify_playlist_id)
-- pair finds the existing snapshot instead of creating a new one.
--
-- The column is nullable: SpinDeck-built playlists (the original use
-- case) leave it null. Only imported snapshots set it.
-- =====================================================================

alter table public.app_playlists
  add column if not exists imported_from_spotify_id text;

-- One snapshot per (owner, source-playlist) pair. Partial so the
-- many SpinDeck-native rows (where the column is null) don't fight
-- each other for uniqueness.
create unique index if not exists app_playlists_owner_imported_unique
  on public.app_playlists (owner_id, imported_from_spotify_id)
  where imported_from_spotify_id is not null;

-- Cheap lookup index for "has anyone imported this Spotify playlist?"
-- queries (e.g. future analytics) and for the partial unique above to
-- be useful on its own column-prefix.
create index if not exists app_playlists_imported_from_spotify_idx
  on public.app_playlists (imported_from_spotify_id)
  where imported_from_spotify_id is not null;
