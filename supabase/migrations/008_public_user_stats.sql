-- =====================================================================
-- 008 — Public profile stats.
-- =====================================================================
-- The profile page shows "N playlists · M saves" for any SpinDeck user,
-- including users you're not following / haven't interacted with. The
-- raw rows behind those numbers are protected by RLS — saved_playlists
-- in particular only lets you read your own bookmarks — so we expose
-- the *aggregates* (and only the aggregates) through a small SECURITY
-- DEFINER function.
--
-- Returning aggregate counts of public information (how many playlists
-- a user has built; how many playlists they've saved) is harmless —
-- we'd happily show the same information on a stat-counter banner.
-- The function is GRANTed to anon + authenticated so anonymous viewers
-- of /u/:username see real numbers too.
--
-- Notes on hardening:
--   * SECURITY DEFINER + SET search_path = public, pg_temp blocks the
--     classic "shadow a built-in via session search_path" attack.
--   * STABLE because we don't write anything; PostgREST can cache
--     within a transaction.
--   * Uses count(*) which is cheap enough at our scale; if a user ever
--     accumulates a million rows we'd swap for a denormalized counter.
-- =====================================================================

create or replace function public.public_user_stats(p_user_id uuid)
returns table (
  playlists_count int,
  saves_count     int
)
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select
    (select count(*)::int
       from public.app_playlists
      where owner_id = p_user_id)        as playlists_count,
    (select count(*)::int
       from public.saved_playlists
      where user_id = p_user_id)         as saves_count;
$$;

-- Grant only EXECUTE — the row data behind the counts is still gated
-- by the existing RLS policies on app_playlists and saved_playlists.
grant execute on function public.public_user_stats(uuid) to anon, authenticated;
