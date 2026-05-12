-- =====================================================================
-- SpinDeck — vinyl label style preference (per-user)
-- =====================================================================
-- Adds a small text column to app_users so each user picks how the
-- asymmetric mark on every vinyl is rendered (the SVG needs SOMETHING
-- off-center to make the spin animation visually readable, and we
-- want users to choose what that mark looks like).
--
-- Valid values are enforced via a CHECK constraint rather than a
-- Postgres enum so we can add styles later without a type-altering
-- migration.
--
-- Run this in the Supabase SQL editor (or via `supabase db push`).
-- =====================================================================

alter table public.app_users
  add column if not exists vinyl_label_style text not null default 'wordmark';

-- The 'rpm' style was retired in favor of the simpler 'tick' mark.
-- Migrate any rows that were already saved as 'rpm' before re-adding
-- the CHECK constraint (otherwise the constraint add would fail on
-- existing data). Safe to run on a fresh DB — the UPDATE just no-ops
-- when there are no rpm rows.
update public.app_users
  set vinyl_label_style = 'tick'
  where vinyl_label_style = 'rpm';

-- Drop+re-add so re-running the migration is idempotent.
alter table public.app_users
  drop constraint if exists app_users_vinyl_label_style_chk;

alter table public.app_users
  add constraint app_users_vinyl_label_style_chk
  check (vinyl_label_style in ('wordmark', 'monogram', 'tick', 'spokes'));
