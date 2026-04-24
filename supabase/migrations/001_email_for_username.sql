-- =====================================================================
-- Migration 001 — email_for_username RPC
-- =====================================================================
-- Lets the sign-in form accept either a username or an email. The
-- client first checks if the identifier contains "@" — if not, it calls
-- this function to resolve username → email, then passes that email
-- into supabase.auth.signInWithPassword().
--
-- SECURITY DEFINER so unauthenticated visitors can call it (they need
-- to, to sign in). Runs with the function owner's privileges, which
-- can see auth.users. We restrict search_path defensively.
--
-- Apply: paste into Supabase dashboard → SQL Editor → Run.
-- =====================================================================

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

-- Make it callable from the browser (both logged-out and logged-in users).
grant execute on function public.email_for_username(text) to anon, authenticated;
