-- =====================================================================
-- 003 — Add owner annotations to app-native playlist songs.
-- =====================================================================
-- Annotated playlists are the headline SpinDeck feature: the playlist
-- owner can attach a short note to each track ("why this is here",
-- "listen at night with headphones", etc.) and everyone who opens the
-- playlist sees it next to the song.
--
-- One annotation per (playlist, track position). Nullable — a song can
-- be in the playlist without a note. Upper bound of 2000 chars matches
-- the notes table so both surfaces feel the same.
-- =====================================================================

alter table public.app_playlist_songs
  add column if not exists annotation text
    check (annotation is null or char_length(annotation) between 1 and 2000);
