-- =====================================================================
-- Migration 002 — auto-create app_users from auth.users
-- =====================================================================
-- Previously the client was responsible for inserting the app_users
-- profile row right after supabase.auth.signUp(). That worked when
-- email confirmation was disabled, but when it's ON, signUp returns no
-- session, the client bails out with a "check your email" message, and
-- the profile row is never inserted — leaving the auth user orphaned
-- forever.
--
-- Now the client passes `username` (and optional `display_name`) via
-- auth.signUp's `options.data`, which Supabase stores on
-- auth.users.raw_user_meta_data. This trigger runs on INSERT to
-- auth.users and materializes the matching app_users row immediately,
-- regardless of whether the user has confirmed their email.
--
-- SECURITY DEFINER so the trigger can bypass RLS on app_users. The
-- search_path is locked down for safety.
--
-- Apply: paste into Supabase dashboard → SQL Editor → Run.
-- =====================================================================

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

  -- If there's no username in metadata (e.g. anonymous sign-in, or a
  -- Supabase-dashboard-created user), leave app_users alone and let the
  -- client handle profile creation. This keeps the trigger safe to
  -- enable globally without breaking non-SpinDeck auth flows.
  if v_username is null or length(v_username) = 0 then
    return new;
  end if;

  insert into public.app_users (id, username, display_name)
  values (new.id, v_username, nullif(v_display_name, ''));

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();


-- ---------------------------------------------------------------------
-- Repair: backfill app_users for any already-orphaned auth users that
-- DO have a username in their signup metadata. (Users created with the
-- old client flow won't have metadata — those need to delete + re-signup.)
-- ---------------------------------------------------------------------
insert into public.app_users (id, username, display_name)
select
  u.id,
  u.raw_user_meta_data->>'username',
  nullif(u.raw_user_meta_data->>'display_name', '')
from auth.users u
left join public.app_users a on a.id = u.id
where a.id is null
  and coalesce(u.raw_user_meta_data->>'username', '') <> ''
on conflict do nothing;
