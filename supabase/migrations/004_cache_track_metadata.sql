-- =====================================================================
-- 004 — Cache Spotify track metadata on app_playlist_songs.
-- =====================================================================
-- Context: Spotify's dev-mode Web API restrictions (Nov 2024 / Feb 2026
-- migration) block Client-Credentials calls to /v1/tracks and /v1/search.
-- Our `spotify-proxy` Edge Function uses Client Credentials, so it can't
-- hydrate track data for dev-mode apps. Rather than require users to
-- upgrade their Spotify app to extended-quota mode, we cache the tiny
-- amount of track metadata we actually display (title, artist, album,
-- cover art, duration) at *add* time. That means:
--
--   * Adding a song requires the owner to be signed into Spotify (we use
--     their personal token to look the track up — that still works).
--   * Viewing the playlist uses zero Spotify calls — everyone, including
--     Public-Mode users, can read annotated playlists without any login.
--
-- All columns are nullable so rows created before this migration don't
-- blow up; the UI shows a "(track unavailable)" placeholder for those.
-- =====================================================================

alter table public.app_playlist_songs
  add column if not exists title          text,
  add column if not exists artist         text,
  add column if not exists album          text,
  add column if not exists album_art_url  text,
  add column if not exists duration_ms    integer check (duration_ms is null or duration_ms >= 0);
