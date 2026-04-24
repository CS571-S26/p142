# SpinDeck — Supabase backend

This folder holds the backend schema and (eventually) Edge Functions for
SpinDeck's notes / favorites / app-native playlists.

## Files

- **`schema.sql`** — full DDL: tables, indexes, triggers, RLS policies,
  and one helper view. Paste into the Supabase SQL editor, or run via
  `supabase db push` once we move to the CLI.

## Tables at a glance

| Table                | Purpose                                                 |
| -------------------- | ------------------------------------------------------- |
| `app_users`          | Pseudonymous profile — unique username, vinyl color.    |
| `spotify_links`      | Optional: attaches Spotify account to an app user.      |
| `app_playlists`      | Playlists created inside SpinDeck (not from Spotify).   |
| `app_playlist_songs` | Track list for app-native playlists (stores Spotify id).|
| `notes`              | Polymorphic notes on songs / app playlists / sp. plists.|
| `song_favorites`     | Heart button; composite PK for toggling.                |
| `song_stats` (view)  | Aggregate (note_count, favorite_count) per track.       |

## Two-mode architecture

1. **Public Mode.** Supabase anonymous sign-in creates `auth.users`;
   first load asks for a unique username and inserts `app_users`. All
   note / favorite / app-playlist features work here.
2. **Spotify-Linked Mode.** The user clicks "Connect Spotify" on their
   profile. OAuth PKCE flow runs, we stash the refresh token in
   `spotify_links`. Unlocks in-app playback and syncing to their
   Spotify playlists. Gated on Spotify dev-mode allowlist for now.

## RLS summary

- **Reads are generous.** Profiles, notes, favorite counts, and public
  playlists are readable by anyone (including unauthenticated clients
  if we ever expose the anon key to them — which we don't, so this is
  really "any signed-in app user").
- **Writes are self-only.** `auth.uid()` must match `owner_id` /
  `author_id` / `user_id` on every insert, update, and delete.
- **Private playlists** are invisible to non-owners.
- **Spotify refresh tokens** are readable only by their owner.

## Next steps

- [ ] Create the Supabase project and run `schema.sql`.
- [ ] Drop the project URL + anon key into `.env.local` as
      `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- [ ] Build `AppUserContext` (anon sign-in + username claim flow).
- [ ] Build `spotify-proxy` Edge Function (Client Credentials flow) so
      Public-Mode users can fetch track metadata without logging in.
- [ ] Wire `notes` into `SongView`; delete the mock `notes` record.
- [ ] Refactor `SpotifyContext` into an enhancement layer
      (`isConnected`, `link()`, `unlink()`).
