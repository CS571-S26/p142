-- =====================================================================
-- 006 — Playlist invites (the social layer on top of share links).
-- =====================================================================
-- Public share links still work (anyone can preview a playlist), but
-- now any signed-in user can also send a directed invite to another
-- SpinDeck user by username. The invite drops into the recipient's
-- "Invites" section on Home where they can Accept (auto-saves the
-- playlist to their library) or Decline.
--
-- Anyone can invite anyone — not just owners — because saved playlists
-- are link-shareable already, so an invite is just a friendlier
-- in-app version of forwarding the link.
--
-- Statuses are: 'pending' (default), 'accepted', 'declined'. We keep
-- responded invites around so the sender can see their history; the
-- recipient inbox query filters to status = 'pending'.
-- =====================================================================

create table if not exists public.playlist_invites (
  id            uuid primary key default gen_random_uuid(),
  playlist_id   uuid not null references public.app_playlists(id) on delete cascade,
  sender_id     uuid not null references public.app_users(id)     on delete cascade,
  recipient_id  uuid not null references public.app_users(id)     on delete cascade,
  message       text check (message is null or char_length(message) between 1 and 280),
  status        text not null default 'pending'
                  check (status in ('pending', 'accepted', 'declined')),
  created_at    timestamptz not null default now(),
  responded_at  timestamptz,
  -- A user can't invite themselves; cleaner to enforce in DB than to
  -- rely on every client codepath to remember.
  constraint    invite_not_self check (sender_id <> recipient_id)
);

-- Prevent the same sender from spamming the same recipient with the
-- same playlist while an invite is still pending. Once it's been
-- accepted / declined, the sender can re-invite (e.g. after the user
-- declined initially and the owner added more songs).
create unique index if not exists playlist_invites_unique_pending
  on public.playlist_invites (playlist_id, sender_id, recipient_id)
  where status = 'pending';

-- Common access pattern: "list all my pending invites, newest first"
create index if not exists playlist_invites_recipient_pending_idx
  on public.playlist_invites (recipient_id, created_at desc)
  where status = 'pending';

-- For the sender's "Sent" view (not used in v1, but cheap to add now).
create index if not exists playlist_invites_sender_idx
  on public.playlist_invites (sender_id, created_at desc);

alter table public.playlist_invites enable row level security;

-- ---------------------------------------------------------------------
-- SELECT: visible to either the sender or the recipient.
-- ---------------------------------------------------------------------
drop policy if exists "playlist_invites_select_party" on public.playlist_invites;
create policy "playlist_invites_select_party"
  on public.playlist_invites
  for select
  to authenticated
  using (sender_id = auth.uid() or recipient_id = auth.uid());

-- ---------------------------------------------------------------------
-- INSERT: any signed-in user can send invites *as themselves* to any
-- other SpinDeck user. The invite_not_self CHECK already blocks self-
-- invites, and the recipient_id FK guarantees the target exists.
-- ---------------------------------------------------------------------
drop policy if exists "playlist_invites_insert_self" on public.playlist_invites;
create policy "playlist_invites_insert_self"
  on public.playlist_invites
  for insert
  to authenticated
  with check (sender_id = auth.uid());

-- ---------------------------------------------------------------------
-- UPDATE: only the recipient can change an invite (to accept / decline).
-- We still let sender-or-recipient pass the using clause for the row to
-- be visible, but the with-check pins the recipient as the only mutator.
-- The API only ever sets status + responded_at, so it's safe to allow a
-- general UPDATE here.
-- ---------------------------------------------------------------------
drop policy if exists "playlist_invites_update_recipient" on public.playlist_invites;
create policy "playlist_invites_update_recipient"
  on public.playlist_invites
  for update
  to authenticated
  using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());

-- ---------------------------------------------------------------------
-- DELETE: sender can withdraw a pending invite they sent. We don't let
-- the recipient hard-delete — declining is the recipient's tool. This
-- preserves the sender's history of "I sent X, they declined" without
-- the recipient being able to silently nuke it.
-- ---------------------------------------------------------------------
drop policy if exists "playlist_invites_delete_sender_pending" on public.playlist_invites;
create policy "playlist_invites_delete_sender_pending"
  on public.playlist_invites
  for delete
  to authenticated
  using (sender_id = auth.uid() and status = 'pending');
