# SpinDeck — Project State

> **Last updated:** 2026-05-06 (added Favorite Parts feature; song-detail play uses playlist context; vinyl spin animation on hover + while playing; user-selectable vinyl label style)
> **Purpose of this doc:** the canonical map of the codebase. Read this *first* before touching files. Every change should also update the relevant section so future sessions don't have to rescan the repo.

---

## 1. Overview

CS571 (UW-Madison) web app called **SpinDeck**. Users build, annotate, and share music playlists. Two intersecting modes:

1. **Public Mode (Supabase)** — every user is a SpinDeck account (email + password + unique username). Sign-in with username or email. Notes, app-native annotated playlists, favorites, invites, profiles all work without ever connecting Spotify.
2. **Spotify-Linked Mode (OAuth PKCE)** — layered on top of a Public-Mode account. Unlocks Spotify Web Playback SDK in-app player, listing the user's own Spotify playlists, importing/forking a Spotify playlist into a SpinDeck-native annotated playlist, and adding tracks (via the user's personal Spotify token). Limited to 25 allowlisted users while the Spotify app sits in dev mode.

Anonymous viewers (no account) can hit shared links to any **app-native** playlist or song page or any user's profile. They get a "Sign up" CTA that round-trips back to the original page after auth.

---

## 2. Tech Stack

| Layer        | Tech                                                            |
|--------------|-----------------------------------------------------------------|
| Build        | Vite 8, TypeScript ~5.9                                         |
| UI           | React 19, React DOM 19                                          |
| Routing      | react-router-dom 7 (`createHashRouter`)                         |
| Styling      | Tailwind CSS 4.2 (via `@tailwindcss/vite`)                      |
| Icons        | lucide-react 1.7                                                |
| Auth (app)   | Supabase email+password (anon key in browser, RLS enforced)     |
| Auth (Spot.) | Spotify OAuth 2.0 PKCE (browser-only, no backend secret)        |
| Backend      | Supabase (Postgres + RLS + Edge Functions). Schema in `supabase/schema.sql`. Edge Function `spotify-proxy` for Client-Credentials flows (referenced from `spotifyProxyApi.ts`; lives outside the React bundle). |
| Player       | Spotify Web Playback SDK (loaded from `sdk.scdn.co` in `index.html`) |
| Lint         | ESLint 9, typescript-eslint, react-hooks, jsx-a11y (WCAG 2.2 AA gate) |
| Deploy       | GitHub Pages from `docs/`, `base: '/p142/'`                     |

**Unused / vestigial deps** (still in `package.json`): `bootstrap`, `react-bootstrap`, `dotenv`, `express`. Nothing imports them. Leaving until cleanup pass.

---

## 3. Project Layout

Top-level (excluding `node_modules`, `.git`, `docs/` build output):

```
webproject/
├── .env                       # VITE_SPOTIFY_CLIENT_ID + Supabase URL/anon key (gitignored)
├── .env.local.example         # template for the above
├── index.html                 # loads Spotify Web Playback SDK + /src/main.tsx
├── package.json
├── vite.config.ts             # base '/p142/', host 127.0.0.1, outDir docs/
├── tsconfig{,.app,.node}.json
├── eslint.config.js           # jsx-a11y rules wired in as the WCAG gate
├── cursor.md                  # THIS FILE
├── README.md                  # default Vite README, ignore
├── public/                    # SVGs (favicon, spindeck logo layers, icons)
├── docs/                      # production build output (gitted, do not hand-edit)
├── supabase/
│   ├── schema.sql             # v1 DDL (see §6); paste into Supabase SQL editor
│   ├── migration_favorite_parts.sql  # adds song_favorite_parts table + favorite_start_ms/end_ms cols
│   ├── migration_vinyl_label_style.sql  # adds app_users.vinyl_label_style + CHECK constraint
│   └── README.md              # quick orientation, mirrors §6 here
└── src/
    ├── main.tsx               # React entry, renders <App />
    ├── index.css              # Tailwind import + disc-spin keyframe (respects prefers-reduced-motion)
    ├── vite-env.d.ts          # ImportMetaEnv types
    ├── types/spotify-sdk.d.ts # ambient typings for window.Spotify (Web Playback SDK)
    ├── assets/                # default Vite assets (mostly unused)
    ├── structural/
    │   ├── App.tsx            # createHashRouter, AppUserProvider > SpotifyProvider > AppGate > PlayerProvider > Router + NowPlayingBar
    │   └── BadgerLayout.tsx   # ORPHANED — old navbar layout, no route uses it
    └── components/
        ├── auth/
        │   ├── AuthPage.tsx           # signed-out screen: sign-in OR sign-up tabs
        │   └── UsernameClaim.tsx      # STUB / DEAD CODE (old anon flow — exports null component)
        ├── data/                       # all hooks, contexts, API helpers (see §5)
        │   ├── supabaseClient.ts
        │   ├── AppUserContext.tsx
        │   ├── SpotifyContext.tsx
        │   ├── PlayerContext.tsx
        │   ├── spotifyAuth.ts
        │   ├── spotifyApi.ts
        │   ├── spotifyProxyApi.ts
        │   ├── notesApi.ts
        │   ├── profileApi.ts
        │   ├── invitesApi.ts
        │   ├── savedPlaylistsApi.ts
        │   ├── appPlaylistsApi.ts
        │   ├── favoritePartsApi.ts     # personal song_favorite_parts CRUD (SongView side)
        │   ├── vinylColors.ts          # shared VINYL_COLORS palette (single source of truth)
        │   ├── vinylLabelStyle.ts      # VinylLabelStyle enum + helpers (extracted to keep AppUserContext fast-refresh-safe)
        │   ├── postAuthRedirect.ts
        │   ├── formatError.ts
        │   └── types.ts                # Song / Playlist (display shapes)
        └── pages/
            ├── LandingPage.tsx         # "/"   — signed-in landing, post-auth redirect handler
            ├── HomePage.tsx            # "/home" — three sections w/ filter pills
            ├── PlaylistView.tsx        # "/playlist/:id" — Spotify playlist
            ├── SongView.tsx            # "/playlist/:id/song/:id" — Spotify track + your description
            ├── AppPlaylistView.tsx     # "/app-playlist/:id" — annotated playlist (public)
            ├── AppSongView.tsx         # "/app-playlist/:id/song/:id" — track + owner annotation (public)
            ├── ProfileView.tsx         # "/profile" (own, editable) AND "/u/:username" (others, read-only)
            ├── InvitesPage.tsx         # "/invites" — pending playlist invites inbox
            ├── NowPlayingBar.tsx       # fixed-bottom player chrome (only renders when SDK ready)
            ├── CreatePlaylistModal.tsx # "+" on Home → creates an app_playlist
            ├── SendInviteModal.tsx     # opens from AppPlaylistView Invite button
            ├── VinylRecord.tsx         # SVG vinyl disc, color+size props
            ├── SpinDeckLogo.tsx        # composite logo (base+disc+arm SVG layers, optional spin)
            └── ui/
                ├── button.tsx          # variants: default, ghost, outline, secondary
                ├── textarea.tsx
                ├── Tabs.tsx            # responsive pill-tabs / mobile <select>. CURRENTLY UNUSED — kept for future tabbed views
                ├── FavoritePartEditor.tsx  # dual-handle slider + mm:ss inputs + "use current position" + clear
                └── FavoritePartDisplay.tsx # read-only range + jump button + "now playing" highlight
```

---

## 4. Routing (HashRouter)

Defined in `src/structural/App.tsx`. `<RequireAuth>` wraps anything that needs a signed-in SpinDeck user; the rest are anonymous-public.

| Path                                       | Component                | Auth?     | Notes |
|--------------------------------------------|--------------------------|-----------|-------|
| `/`                                        | `LandingPage`            | required  | Hero + "Enter SpinDeck" / "Connect Spotify" / "Log out". Reads `consumePostAuthRedirect()` and bounces back to `/app-playlist/:id` if pending. |
| `/home`                                    | `HomePage`               | required  | Three filter-pill sections: Your Playlists, Saved, Spotify (`?show=...` URL param). Header has invites bell + profile + connect Spotify + logout. |
| `/playlist/:playlistId`                    | `PlaylistView`           | required  | Spotify-sourced. Owner-only edit. "Share with SpinDeck" forks to an `app_playlist`. |
| `/playlist/:playlistId/song/:songId`       | `SongView`               | required  | Spotify track. Description = current user's personal note (single, edit-in-place). |
| `/app-playlist/:playlistId`                | `AppPlaylistView`        | **public**| Annotated playlist. Owner gets edit toggle (search Spotify → add → annotate). Viewers get Save / Invite / Share. Anonymous viewers get Sign-up CTA. `?edit=1` opens directly into edit mode. |
| `/app-playlist/:playlistId/song/:songId`   | `AppSongView`            | **public**| Single track + owner's annotation. Owner edits in place. |
| `/profile`                                 | `ProfileView ownProfile` | required  | Edit display name, see your playlist + saves count. |
| `/u/:username`                             | `ProfileView`            | **public**| Anyone's profile (read-only). Auto-flips to editable if it happens to be your own. |
| `/invites`                                 | `InvitesPage`            | required  | Inbox of pending playlist invites. Accept = auto-save the playlist. |

`AppGate` (in App.tsx) gates the whole router on `AppUserContext.status`:
- `loading` → splash
- `error` → "Couldn't start SpinDeck" page (e.g. Supabase not configured)
- `signed_out` and `ready` → router renders; `RequireAuth` per-route handles redirecting signed-out users to `<AuthPage />` for protected paths.

---

## 5. Source-File Index — `src/components/data/` and `src/components/pages/`

Each entry: what it does → key exports → who uses it. **Update this when adding/removing files.**

### 5.1 `data/` (contexts, API clients, helpers)

#### `supabaseClient.ts`
Creates the singleton `supabase` client from `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`. Uses storage key `spindeck-auth` so it doesn't collide with Spotify token keys. Exports `supabase`, `SUPABASE_CONFIGURED` (bool — used by AppUserContext to surface a clean error when env is missing).

#### `AppUserContext.tsx`
The Supabase auth + profile context. Wraps the entire app.
- **Status machine**: `loading | signed_out | ready | error`.
- **Exports**: `AppUserProvider`, `useAppUser()`, types `AppUser`, `Result`. Also re-exports `VinylLabelStyle`, `VINYL_LABEL_STYLES`, `DEFAULT_VINYL_LABEL_STYLE` from `./vinylLabelStyle` so older callsites keep working.
- **`AppUser`** now carries `vinylLabelStyle: VinylLabelStyle` (defaults to `"wordmark"`). Picked on `/profile`; applied globally — every `<VinylRecord>` reads the current user's choice from this context unless given an explicit prop override.
- **Methods**: `signUp({email,password,username,displayName?})`, `signIn({identifier,password})` (identifier = username **or** email — calls `email_for_username` RPC for the username case), `signOut()`, `updateProfile({displayName?, vinylColor?, vinylLabelStyle?})`.
- **Pre-flight checks** username availability before `auth.signUp`; surfaces friendly errors via `humanizeSupabaseError` for codes 23505 / "already registered" / "Invalid login credentials" / "Email not confirmed".
- **`reconcile()`** runs after every auth state change: if there's a session but no `app_users` row, it signs the user out so they don't end up half-bootstrapped. The DB trigger `handle_new_auth_user` is supposed to create the row; this is the safety net.
- **Listens to** `supabase.auth.onAuthStateChange` for cross-tab + token-refresh events.

#### `SpotifyContext.tsx`
PKCE state, token storage, refresh scheduling, ownership guard. Provides `useSpotify()`.
- **Exports**: `SpotifyProvider`, `useSpotify()`. Returns `{ token, isConnected, isLoading, login(), logout() }`.
- **Bootstrap sequence**:
  1. Wait for `AppUserContext.status !== "loading"`.
  2. If `?code=` is in the URL → exchange code for tokens, stamp `LS_OWNER_APP_USER_ID = currentUserId`, navigate to `#/home`.
  3. Else if cached tokens exist → owner-check first (ditch tokens that belong to a different SpinDeck user; we never share Spotify access across SpinDeck accounts in the same browser).
  4. Else if expired but refresh-token exists → silently refresh.
- **Refresh logic**: scheduled 5 min before expiry. Two error kinds (see `spotifyAuth.RefreshError`):
  - `auth` (invalid_grant / 401) → tokens dead, clear and force reconnect.
  - `transient` (network / 5xx) → keep cached tokens, retry in 30 s. Visibility / focus / online events also trigger a refresh — fixes the "I came back to my laptop and Spotify is disconnected" bug.
- **Same-tab event bus**: `SPOTIFY_TOKEN_REFRESH_EVENT` (custom event) is dispatched by `saveTokens()`; this context listens so a 401-recovery refresh inside `spotifyApi` updates React state immediately. Cross-tab uses the native `storage` event.

#### `PlayerContext.tsx`
Wraps the Spotify Web Playback SDK (`window.Spotify.Player`). Spawns a player named "SpinDeck" once `SpotifyContext.token` is available.
- **Exports**: `PlayerProvider`, `usePlayer()`, types `FavoritePartHighlight`, `PlayingPlaylist`. Returns `{ isReady, isPlaying, currentTrack, position, duration, isShuffled, currentFavoritePart, currentPlaylistId, play(), togglePlayPause, skipNext, skipPrev, seek, toggleShuffle, setCurrentFavoritePart() }`.
- **`play({ uris?, contextUri?, offsetIndex?, offsetUri?, playlistId? })`** delegates to `startPlayback` in `spotifyApi.ts` (REST, because the SDK doesn't expose start-arbitrary-context). The `playlistId` arg is metadata only — it's stripped before the SDK call and stored in `currentPlaylistId` so pages can spin the right vinyl.
- **`currentPlaylistId: { kind: "spotify" | "app"; id: string } | null`** — the playlist sourcing the audio. Updated inside `play()` on every successful call. Persists across pause/skip; never auto-cleared (a paused playlist is still "the active" one). HomePage / PlaylistView / AppPlaylistView combine it with `isPlaying` to decide whether to spin a vinyl.
- **Shuffle** is mirrored from `player_state_changed` (Spotify treats it as player-level state). `toggleShuffle` is optimistic + REST call (`setShuffle` in `spotifyApi`); rolls back on failure.
- **Position tick**: 500 ms `setInterval` while playing, capped at `duration`.
- **`currentFavoritePart`** is page-pushed (NOT auto-fetched). When SongView/AppSongView/AppPlaylistView's currently-playing track has a favorite part defined, the page calls `setCurrentFavoritePart({startMs, endMs, trackId})`. Auto-clears on `currentTrack.id` change. The setter ignores stale pushes (where `value.trackId !== currentTrack.id`) so a slow async fetch can't paint the wrong song.
- **Mounted in** `AppGate` (so it has access to a token AND a SpinDeck user).

#### `spotifyAuth.ts`
Pure module — PKCE primitives + localStorage helpers + the typed `RefreshError`.
- **localStorage keys** (exported): `LS_ACCESS_TOKEN`, `LS_REFRESH_TOKEN`, `LS_TOKEN_EXPIRY`, `LS_OWNER_APP_USER_ID`. `clearTokens()` wipes all four.
- **sessionStorage keys**: `spotify_code_verifier`, `spotify_auth_state` (only during the redirect round-trip).
- **`SCOPES`**: `playlist-read-private playlist-read-collaborative playlist-modify-private playlist-modify-public user-library-read user-read-private user-read-email streaming user-modify-playback-state`.
- **`getRedirectUri()`** = `window.location.origin + "/p142/"`. **Must match Spotify Dashboard exactly, trailing slash required.**
- **`SPOTIFY_TOKEN_REFRESH_EVENT`** custom event + `TokenRefreshDetail` type — emitted by `saveTokens()` so any same-tab listener (SpotifyContext) updates instantly.
- `redirectToSpotifyAuth` always sets `show_dialog=true` (currently kept on so users get re-prompted for the modify scopes added 2026-04-21).

#### `spotifyApi.ts`
Spotify Web API client (uses the user's personal access token).
- **`spotifyFetch` / `spotifyFetchRaw`** wrap fetch with 401-retry: on 401, calls `refreshAccessToken`, saves, retries once. On `RefreshError.kind === "auth"` clears tokens + throws "Session expired"; on `transient`, leaves tokens intact and bubbles an API error so the user stays connected.
- **Endpoints in use**:
  | Function | Endpoint | Returns |
  |----------|----------|---------|
  | `fetchUserPlaylists(token)` | `GET /me` + `GET /me/playlists?limit=50` (filters to playlists owned by `me.id` because dev-mode 403s any followed/editorial playlist) | `Playlist[]` |
  | `fetchPlaylistDetail(token, id)` | `GET /playlists/{id}` (paginates `next`) | `PlaylistDetail` |
  | `fetchTrack(token, id)` | `GET /tracks/{id}` | `Song` |
  | `fetchCurrentUser(token)` | `GET /me` | `{ id, displayName }` |
  | `searchTracks(token, q, limit?)` | `GET /search?q=…&type=track` | `Song[]` |
  | `addTracksToPlaylist(token, id, uris)` | `POST /playlists/{id}/items` body `{ uris }` (chunks of 100) | void |
  | `removeTracksFromPlaylist(token, id, uris)` | `DELETE /playlists/{id}/items` body `{ items: [{ uri }] }` | void |
  | `startPlayback(token, deviceId, options)` | `PUT /me/player/play?device_id=…` body `{ uris? \| context_uri+offset }` | void. Options: `{ uris?, contextUri?, offsetIndex?, offsetUri? }`. `offset` becomes `{ position }` for `offsetIndex` or `{ uri }` for `offsetUri` (Spotify accepts only one shape; `offsetUri` wins if both passed). Used by SongView so the play button starts the surrounding playlist context, not just the single track. |
  | `setShuffle(token, deviceId, state)` | `PUT /me/player/shuffle?state=…&device_id=…` | void |
- **Vinyl colors**: 12-color palette duplicated here and in `appPlaylistsApi.ts` (kept in sync manually — same hex values).
- **Field rename quirk** (Nov 2024): `/me/playlists` returns `items.total` instead of `tracks.total`. Code fallbacks: `p.items?.total ?? p.tracks?.total ?? 0`.
- **Feb 2026 dev-mode migration**: `/playlists/{id}/tracks` was renamed to `/playlists/{id}/items` for dev-mode apps. Old path returns bare 403. DELETE wants `{ items: [{ uri }] }` (NOT the legacy `{ tracks: [{ uri }] }` or `?uris=` query).

#### `spotifyProxyApi.ts`
Client wrapper around the **`spotify-proxy` Edge Function** (which holds a Client-Credentials app token server-side).
- **Exports**: `searchTracksPublic(query, limit?)`, `fetchTracksPublic(ids[])`. Same `Song` shape as `spotifyApi`.
- **Status**: defined but **not actually exercised in the current UI**. Spotify dev-mode locks Client Credentials out of `/v1/tracks` and `/v1/search`, so adding songs in `AppPlaylistView` requires the *owner's* personal Spotify token (the edit panel renders a "Connect Spotify" CTA otherwise). This file becomes useful once the app reaches Spotify extended-quota / production mode, OR if we ever fall back to it for read-only tasks the proxy can serve.

#### `notesApi.ts`
Polymorphic notes (one table covers song notes, app-playlist notes, Spotify-playlist notes).
- **Exports**: `fetchNotes(targetType, targetId)`, `createNote({authorId, targetType, targetId, body})`, `updateNote(noteId, body)`, `deleteNote(noteId)`, `timeAgo(iso)`.
- **Type**: `NoteWithAuthor` (camelCase) + `NoteTargetType = 'song' | 'app_playlist' | 'spotify_playlist'`.
- **Joins** via FK embed: `author:app_users!notes_author_id_fkey(username, display_name)`. RLS enforces author-only writes.
- **Today**: only Spotify-side `SongView` uses notes (one note per user per track — current user's own personal description). App-playlist annotations are stored on `app_playlist_songs.annotation`, not in this table.

#### `profileApi.ts`
Read-only profile data.
- **Exports**: `fetchProfileByUsername(u)`, `fetchProfileById(id)`, `fetchUserStats(userId)` (calls `public_user_stats` RPC), `listPublicPlaylistsByOwner(ownerId)`.
- **Types**: `PublicProfile`, `UserStats`. Username matching is `ilike` (case-insensitive equals; safe because USERNAME_RE allows only `[A-Za-z0-9_]`).
- **Identity edits** go through `AppUserContext.updateProfile` (not here).

#### `invitesApi.ts`
Directed playlist invites (`playlist_invites` table).
- **Exports**: `searchUsersByUsername(query, excludeUserId, limit?)`, `sendInvite({senderId, recipientUsername, playlistId, message?})`, `listPendingInvites(recipientId)`, `respondToInvite({inviteId, recipientId, playlistId, action})`.
- **Types**: `UserSearchResult`, `PendingInvite`.
- **Resolve username → id client-side** before INSERT (friendly error vs raw FK violation).
- **Acceptance** auto-saves the playlist via `savePlaylist`; failures there are swallowed (the user can still re-save from the playlist page).
- **Unique partial index** on `(playlist_id, sender_id, recipient_id) WHERE status='pending'` — duplicate invites surface as Postgres code `23505`.

#### `savedPlaylistsApi.ts`
"Bookmark" CRUD over `saved_playlists`.
- **Exports**: `savePlaylist(userId, playlistId)` (idempotent upsert), `unsavePlaylist`, `isPlaylistSaved`, `listSavedPlaylists(userId)`.
- **Live bookmarks** — never copies tracks/annotations; the saver always reads the canonical `app_playlist` row.

#### `appPlaylistsApi.ts`
The big one. CRUD for SpinDeck-native annotated playlists.
- **Types**: `AppPlaylistSummary`, `AppPlaylistSong`, `AppPlaylistDetail`. `AppPlaylistSong` carries `favoriteStartMs / favoriteEndMs` (nullable) for the owner-set favorite-part feature. Display via cached columns on `app_playlist_songs` (title/artist/album/album_art_url/duration_ms) — caching is required because dev-mode Client Credentials can't fetch tracks.
- **Reads**: `listMyPlaylists(ownerId)`, `fetchPlaylist(playlistId)`. Both include song-count aggregate via PostgREST embed `app_playlist_songs(count)`. Song SELECT includes `favorite_start_ms, favorite_end_ms` (added by the favorite-parts migration).
- **Playlist CRUD**: `createPlaylist`, `updatePlaylist`, `deletePlaylist` (validates name 1–80 chars).
- **Songs CRUD**: `addSong({playlistId, song, addedBy, annotation?})` writes at `nextPosition`, caching all metadata. `removeSong({playlistId, position})` deletes then re-packs positions client-side (composite-PK `(playlist_id, position)` precludes in-place decrement). `updateAnnotation({playlistId, position, annotation})` (max 2000 chars). `updateAppPlaylistFavoritePart({playlistId, position, startMs, endMs})` — pass both nulls to clear; otherwise validates `startMs >= 0 && endMs > startMs`. Owner-only via existing RLS.
- **Spotify-import path** (used by `PlaylistView`'s "Share with SpinDeck"): `findImportedSpotifyPlaylist({ownerId, spotifyPlaylistId})` looks up an existing snapshot via `imported_from_spotify_id` column; `importSpotifyPlaylist({...})` creates the playlist row + bulk-inserts songs (with metadata cache). Re-import is a no-op (returns existing id). Snapshots are NOT auto-synced with Spotify.
- **`VINYL_COLORS`** is re-exported from `./vinylColors` (single source of truth) so callers that already pull it from here (`CreatePlaylistModal`) don't break.

#### `vinylColors.ts`
Shared palette (currently 24 colors) used by `appPlaylistsApi`, `spotifyApi`, and the profile avatar default. Adding a new color: append to the array — never reorder, since existing rows reference colors by index via `pickColor(index)` in `spotifyApi`. The first 12 are the original palette; the second 12 (added 2026-05-06) are on-brand earth tones plus broader hues so users with many playlists hit fewer obvious repeats.

#### `vinylLabelStyle.ts`
Single source of truth for the four asymmetric marks `VinylRecord` can render: `"wordmark" | "monogram" | "tick" | "spokes"`. Exports the `VinylLabelStyle` type, the `VINYL_LABEL_STYLES` array (used by `ProfileView`'s picker), `DEFAULT_VINYL_LABEL_STYLE`, and `parseLabelStyle()` for tolerant DB-row decoding. Lives in its own module so `AppUserContext.tsx` (a component file) doesn't trip `react-refresh/only-export-components`.

#### `favoritePartsApi.ts`
Personal favorite-part CRUD on `song_favorite_parts` (the per-user-per-track table). Pairs with `notesApi` on the SongView side. Owner-set favorite parts on app-playlists go through `appPlaylistsApi.updateAppPlaylistFavoritePart` instead.
- **Type**: `FavoritePart = { startMs, endMs, updatedAt? }`.
- **Exports**: `fetchMyFavoritePart(userId, trackId)` (returns `FavoritePart | null`), `setMyFavoritePart({userId, trackId, startMs, endMs})` (upsert, validates `startMs < endMs` client-side), `clearMyFavoritePart(userId, trackId)`.
- **RLS**: public read, self write. So a future "people who pinned this track's chorus" feature could read aggregate counts.

#### `postAuthRedirect.ts`
SessionStorage breadcrumb so anonymous → sign-up → original-playlist works.
- **Exports**: `setPostAuthRedirect({returnTo, autoSave?})`, `consumePostAuthRedirect()` (read-and-clear), `extractAppPlaylistId(returnTo)`.
- **Used by**: `AppPlaylistView` (sets it on Sign-up CTA) and `LandingPage` (consumes after signed-in render, optionally auto-saves the playlist).
- Validates `returnTo` starts with `/` so a tampered value can't bounce off-site.

#### `formatError.ts`
Coerce thrown `unknown` into a string. Handles `Error`, Supabase `PostgrestError` (uses `.hint` if present), strings, plain objects. Use this everywhere a user-facing error string is needed.

#### `types.ts`
Display shapes used across the UI. Don't put DB types here; those live next to their respective api files.
```ts
interface Song {
  id: string;          // Spotify track id
  title: string;
  artist: string;      // comma-separated
  album: string;
  albumArt: string;
  noteCount: number;   // always 0 from Spotify; Supabase aggregates not yet wired
  favoriteCount: number;
  duration: string;    // formatted "M:SS"
  durationMs?: number; // raw, used when persisting to app_playlist_songs
  uri?: string;        // "spotify:track:..."
}

interface Playlist {
  id, name, description, vinylColor, songCount, songs[]
}
```

---

### 5.2 `pages/` (route components + a couple of shared atoms)

#### `LandingPage.tsx` (`/`)
Hero + three buttons (Enter, Connect Spotify, Log out). Reads `consumePostAuthRedirect()` on mount when `user.id` becomes available; if a redirect is pending, optionally auto-saves the playlist and `navigate(returnTo, { replace: true })`. Shows "Welcome — taking you back to the playlist…" while redirecting.

#### `AuthPage.tsx`
Tab UI for sign-in vs sign-up. Sign-in identifier accepts username or email. Sign-up: username (3–24 chars `[A-Za-z0-9_]`), display name (optional), password (min 6), email. Submit goes through `useAppUser().signUp` / `signIn`.

#### `HomePage.tsx` (`/home`)
Three sections gated by `?show=playlists,saved,spotify` filter pills (default = all on, URL stays clean). Sections:
1. **Your SpinDeck Playlists** — `listMyPlaylists(user.id)` → cards link to `/app-playlist/:id`. "Create playlist" opens `CreatePlaylistModal`; on success, optimistically prepends and `navigate('/app-playlist/:id?edit=1')` so the user lands in edit mode.
2. **Saved Playlists** — `listSavedPlaylists(user.id)` → cards link to `/app-playlist/:id` (read-only for non-owners).
3. **Your Spotify Playlists** — `fetchUserPlaylists(token)` → cards link to `/playlist/:id` with router state `{name, description, vinylColor, songCount}`. Renders a "Connect Spotify" CTA card if not connected.
- Header: SpinDeck logo, brand text, `@username` link to `/profile`, "Connect Spotify" pill (if not connected), invites bell with badge (count via `listPendingInvites(user.id).length`), profile icon, Log out.

#### `PlaylistView.tsx` (`/playlist/:id` — Spotify)
Live Spotify playlist. Header shows vinyl + name + "N songs • by Owner".
- **`canEdit`** = `detail.ownerId === currentUserId || detail.collaborative`. The Edit button greys + tooltip when `!canEdit`.
- **Edit mode**: debounced (300 ms) Spotify track search panel ("Add songs"); search results show album art + title + artist; tracks already in the playlist render as disabled "Added". Each existing row gets a trash-icon Remove. Row clicks (which navigate to SongView) are suppressed while editing.
- **"Share with SpinDeck"** button (visible to anyone signed in, hidden in edit mode and when empty): calls `findImportedSpotifyPlaylist`; if existing → `navigate('/app-playlist/:id')`; else `importSpotifyPlaylist` and navigate. After first import the button text flips to "Open SpinDeck copy".
- 403 errors render "This playlist is restricted" with explanation (Spotify's editorial / algorithmic playlists).

#### `SongView.tsx` (`/playlist/:id/song/:id` — Spotify track)
Big art header + title/artist/album/duration + play/pause button (gated on `isReady`).
- **Favorite part block** (above description): personal `song_favorite_parts` row for this user + this track id. Edit via `FavoritePartEditor`, display via `FavoritePartDisplay` with jump-to-start. Pushes to `PlayerContext.setCurrentFavoritePart` when this track is currently playing so `NowPlayingBar` gets the band globally.
- **Description block** = current user's most recent `notes` row for `target_type='song', target_id=songId`. Owner-only edit-in-place via `updateNote` (preserves id + created_at). Empty state for new users. Anonymous users can't reach this route (gated).
- The `notes` table is multi-author; this page intentionally surfaces only the current user's row. Other users' notes still exist in DB if we ever want to bring back a comment feed.

#### `AppPlaylistView.tsx` (`/app-playlist/:id` — public)
Single-page View ↔ Edit toggle.
- **View mode** (everyone): liner-notes layout. Each song row shows annotation in a `<blockquote>`; per-row "Hide note / Show note" toggle. Click row → `/app-playlist/:id/song/:trackId`.
- **Edit mode** (owner only, `?edit=1` to start there): name + description inline-edit textareas (saved on blur via `updatePlaylist`), search panel (uses `searchTracks` — owner's personal Spotify token; renders "Connect Spotify" CTA when not connected), per-row trash button + per-row annotation textarea + "Save note" button. Two-step inline confirm for "Delete playlist".
- **Header buttons** (mode-dependent):
  - Play All — visible when `isReady && isConnected && songs.length > 0 && !isEditing`. Plays via `play({ uris: songs.map(...) })` — **not** a contextUri because we don't have one for an app_playlist.
  - Share — copies `window.location.href` to clipboard (falls back to `window.prompt` in non-HTTPS).
  - Invite — opens `SendInviteModal`. Visible to any signed-in user (owner OR saver).
  - Save — owner-less signed-in users only. Optimistic flip via `savePlaylist` / `unsavePlaylist`.
  - Edit — owner only.
- Anonymous viewers see a **Sign-up CTA banner** + a header "Sign up" button that calls `goToSignup()` → `setPostAuthRedirect({returnTo: location.pathname, autoSave: true})` + `navigate('/')`.

#### `AppSongView.tsx` (`/app-playlist/:id/song/:id` — public)
Single-track page for an app-playlist. Mirrors `SongView` visually.
- **Favorite part block** (above description): owner-set range stored on `app_playlist_songs.favorite_start_ms / favorite_end_ms`. Owner edits via `FavoritePartEditor` → `updateAppPlaylistFavoritePart`; viewers see read-only `FavoritePartDisplay` with a jump button. Pushes to `PlayerContext.setCurrentFavoritePart` when this track is currently playing.
- **Description block** = the **owner's annotation** for the song in this playlist (one description, not a comment feed). Owner can edit-in-place via `updateAnnotation`. Viewers see read-only or empty state.

#### `ProfileView.tsx` (`/profile` and `/u/:username`)
One component, two flavors. `ownProfile` prop chooses initial behavior; `isOwn = user.id === profile.id` is the actual edit-gate.
- Vinyl avatar in `profile.vinylColor` (no image upload yet). Avatar previews the draft `vinylLabelStyle` live while the user is in edit mode.
- Stats card: `playlistsCount` + `savesCount` from `public_user_stats` RPC.
- Playlists grid: `listPublicPlaylistsByOwner(profile.id)` → cards link to `/app-playlist/:id`.
- Edit (own only): inline display-name input + 2x4 (or 2x2 on mobile) **vinyl label style picker** — clicking a preview vinyl swaps the live preview, then Save persists via `updateProfile({vinylLabelStyle})`. Cancel resets the draft. **Username changes are NOT exposed** (everything keys on it).

#### `InvitesPage.tsx` (`/invites`)
Pending playlist invites. Each row shows sender `@username` (linked to `/u/:username`), playlist vinyl + name + song count, optional sender message, Accept / Decline buttons. Optimistic pop on response; restore on failure. Accept flows through `respondToInvite` (which auto-saves the playlist).

#### `NowPlayingBar.tsx`
Fixed-bottom bar, only renders when `usePlayer().isReady && currentTrack`. Progress slider (clickable + keyboard `←/→` 5 s, `Home/End`). Shuffle toggle (orange when on, with a small dot underneath). Skip prev / play-pause / skip next. Time readout hidden on phones.
- **Favorite-part band**: when `PlayerContext.currentFavoritePart` is set AND its `trackId` matches the playing track, draws a translucent orange band on the progress bar from `startMs%..endMs%`. When `position` is inside the range, a small "♥ Favorite" chip appears next to the track title.

#### `CreatePlaylistModal.tsx`
Hand-rolled modal (no shadcn Dialog primitive) with name + description + vinyl color picker (`<fieldset>`/`<legend>` for swatches). Calls `createPlaylist`. `is_public: true` always (no UI knob — we still write it).

#### `SendInviteModal.tsx`
Username autocomplete (debounced 200 ms, calls `searchUsersByUsername`). Optional 280-char message. Submit calls `sendInvite`.

#### `VinylRecord.tsx`
Square SVG vinyl. `color` (hex) + `size` (numeric px) OR `className` (Tailwind size-* utilities). When `className` is given, `width`/`height` are omitted so Tailwind drives responsive sizes.
- **`spinning?: boolean`** — when true, the disc spins continuously (4 s rotation, transform-origin: center). When false, hovering a `.group` ancestor still triggers the spin via the `.group:hover .vinyl-disc` rule in `index.css`. The animation is always-attached and toggled via `animation-play-state` so the disc resumes from where it stopped instead of snapping back to 0° on hover-out.
- **`labelStyle?: VinylLabelStyle`** — picks one of four asymmetric marks on the white center label: `wordmark` (curved "SPINDECK"), `monogram` (bold "SD"), `tick` (small triangle wedge at 12 o'clock), `spokes` (two radial ticks at 12/6). Without an asymmetric feature the spin is visually invisible — the SVG would render pixel-identical at every angle. **Default reads from `AppUserContext.user?.vinylLabelStyle`** so the user's saved choice applies everywhere; pages can pass an explicit `labelStyle` prop to override (used by `ProfileView`'s edit picker to preview the draft choice live).
- **Highlight arc**: thin translucent white sweep across the upper-right quadrant of the disc — secondary motion cue, especially on dark colors. Always rendered regardless of label style.
- **CSS class**: every `<VinylRecord>` SVG carries the `vinyl-disc` class. `index.css` defines the keyframe + base rule. `prefers-reduced-motion` is honored — the keyframe degrades to a no-op at the system level.

#### `SpinDeckLogo.tsx`
Composite of three SVG layers (`spindeck-base.svg`, `spindeck-disc-only.svg`, `spindeck-arm-only.svg`) under `public/`. The disc layer optionally spins via the `disc-spin` keyframe in `index.css` (`spinSeconds` prop; 0 disables; `prefers-reduced-motion` keeps the disc still). Disc center transform-origin pinned to `48.5% / 50.1%` of the cropped viewBox.

#### `ui/button.tsx`
`variant`: `default | ghost | outline | secondary`. `secondary` is the cream "toolbar" style used for Share/Invite/Edit chips on AppPlaylistView. `forwardRef`, accepts native `ButtonHTMLAttributes`.

#### `ui/textarea.tsx`
Styled `<textarea>`, focus ring matches the orange accent. `forwardRef`.

#### `ui/Tabs.tsx`
Generic responsive tab component (pill bar on sm:+, `<select>` on phones). **Currently not imported anywhere** — kept for future tabbed views (e.g., Profile sub-tabs).

---

## 6. Supabase Schema (`supabase/schema.sql`)

> **Heads-up:** `schema.sql` is the original v1 dump (2026-04). Several later migrations exist as references in code (numbered 002, 004, 008, etc. in comments) but **are not all reflected in `schema.sql` yet**. The DB is authoritative — when in doubt, query Supabase. Things added since v1 that the code references but `schema.sql` does not currently contain:
>
> - `app_playlists.imported_from_spotify_id` (text, nullable). Used by `findImportedSpotifyPlaylist` / `importSpotifyPlaylist`.
> - `saved_playlists` table — `(user_id, playlist_id, saved_at)` PK on both. Used by `savedPlaylistsApi.ts`.
> - `playlist_invites` table — `(id, playlist_id, sender_id, recipient_id, message, status, created_at, responded_at)`. Status enum / partial unique index on `(playlist_id, sender_id, recipient_id) WHERE status='pending'`. Used by `invitesApi.ts`.
> - **`song_favorite_parts` table** — added by `migration_favorite_parts.sql`. Composite PK `(user_id, spotify_track_id)`, columns `start_ms`, `end_ms`, `updated_at`. RLS public-read / self-write. Used by `favoritePartsApi.ts`.
> - **`app_playlist_songs.favorite_start_ms` / `favorite_end_ms`** (int, nullable) — added by `migration_favorite_parts.sql`. CHECK constraint enforces both-null OR both-non-null with `start_ms >= 0 && end_ms > start_ms`.
> - **`app_users.vinyl_label_style`** (text, default `'wordmark'`) — added by `migration_vinyl_label_style.sql`. CHECK constraint restricts to `wordmark | monogram | rpm | spokes`. Read on every load and used as the default `labelStyle` prop for every `<VinylRecord>`.
> - RPC `public_user_stats(p_user_id)` — returns `(playlists_count, saves_count)`. Used by `profileApi.fetchUserStats`.
> - RPC `email_for_username(p_username)` — IS in v1 schema; used for username-based sign-in.
> - DB trigger `handle_new_auth_user` IS in v1 schema; called on `auth.users` INSERT to materialize the `app_users` row from signUp metadata.

### Tables (v1)

| Table                | PK                                  | Notes |
|----------------------|-------------------------------------|-------|
| `app_users`          | `id` (= `auth.users.id`)            | `username citext UNIQUE`, regex `^[A-Za-z0-9_]+$`, 3–24 chars; `display_name`, `vinyl_color` default `#1a1a2e`, `vinyl_label_style` (added later, default `'wordmark'`, CHECK in `wordmark/monogram/tick/spokes`), `created_at`. |
| `spotify_links`      | `app_user_id`                       | One per app_user. `spotify_user_id UNIQUE`, optional raw `refresh_token` (planned to move into Vault/pgsodium). |
| `app_playlists`      | `id` (uuid)                         | `owner_id`, `name` (1–80), `description`, `vinyl_color`, `is_public` (default true), `created_at/updated_at`, **`imported_from_spotify_id` (added later)**. Indexes on `owner_id` and partial on `is_public`. `updated_at` auto-touched via trigger. |
| `app_playlist_songs` | `(playlist_id, position)`           | `spotify_track_id`, `added_by`, `added_at`, `annotation` (1–2000 chars), cached `title`/`artist`/`album`/`album_art_url`/`duration_ms`. Index on `spotify_track_id`. |
| `notes`              | `id` (uuid)                         | `author_id`, `target_type` enum `note_target` (`song` \| `app_playlist` \| `spotify_playlist`), `target_id` text, `body` (1–2000), `created_at`. Indexes on `(target_type, target_id, created_at desc)` and `author_id`. |
| `song_favorites`     | `(user_id, spotify_track_id)`       | Heart button. |
| `saved_playlists`    | `(user_id, playlist_id)`            | **Added later.** Live bookmarks of other users' app_playlists. |
| `playlist_invites`   | `id` (uuid)                         | **Added later.** Status enum: `pending` / `accepted` / `declined`. Partial unique index on `(playlist_id, sender_id, recipient_id) WHERE status='pending'`. |
| `song_favorite_parts`| `(user_id, spotify_track_id)`       | **Added by `migration_favorite_parts.sql`.** Personal favorite-part range per user per Spotify track. RLS public-read / self-write. |

### Helper view / RPCs

- **View `song_stats`**: per-track `(spotify_track_id, note_count, favorite_count)`. Cheap selects backed by the existing indexes. Currently not consumed by the UI.
- **`email_for_username(p_username text) returns text`**: `SECURITY DEFINER`, granted to `anon, authenticated`. Powers username-based sign-in.
- **`public_user_stats(p_user_id uuid) returns table(playlists_count int, saves_count int)`**: SECURITY DEFINER, used on profile pages.
- **Trigger `on_auth_user_created`** (on `auth.users` INSERT): reads `raw_user_meta_data->>'username'` and `display_name`, inserts the matching `app_users` row. No-op when `username` metadata is absent.
- **Trigger `app_playlists_touch_updated_at`**: bumps `updated_at` on every UPDATE to `app_playlists`.

### RLS Posture (guiding principles)

- **Reads**: generous. `app_users`, `notes`, `song_favorites`, `app_playlists` (when `is_public OR owner = auth.uid()`), and `app_playlist_songs` (via parent readability) are all selectable broadly.
- **Writes**: strictly self-only — `auth.uid()` must match `owner_id` / `author_id` / `user_id` on insert/update/delete.
- **`spotify_links`**: read AND write are owner-only (refresh tokens are sensitive).
- **Private playlists**: invisible to non-owners.

---

## 7. Auth Flows

### 7.1 SpinDeck account (Public Mode)

**Sign up** (`AuthPage` → `useAppUser().signUp`):
1. Validate username (3–24 chars, regex).
2. Pre-flight `select id from app_users where username=…` (anon has SELECT per RLS) — surface "already taken" without the cryptic 23505 from the trigger insert.
3. `supabase.auth.signUp({ email, password, options.data: { username, display_name } })`.
4. DB trigger `handle_new_auth_user` materializes `app_users` row from metadata.
5. If email confirmation is enabled (no session returned) → "Check your email…" message.
6. Else → `reconcile()` picks up the new profile and we land on Home.

**Sign in** (`useAppUser().signIn({identifier, password})`):
1. If `identifier` contains `@` → use as email. Else → `supabase.rpc('email_for_username', { p_username })`.
2. `supabase.auth.signInWithPassword({ email, password })`.
3. `reconcile()`. If session exists but profile missing → sign out and surface a specific error.

**Sign out**: `useAppUser().signOut()` → `supabase.auth.signOut()` + clear local state. AppGate flips to `signed_out`, AuthPage renders.

### 7.2 Spotify (OAuth 2.0 PKCE)

**Connect** (`useSpotify().login()`):
1. Generate `code_verifier` (64 chars), `state` (16 chars), SHA-256 → base64url for `code_challenge`.
2. Stash verifier + state in `sessionStorage`. Redirect to `https://accounts.spotify.com/authorize` with `show_dialog=true`.
3. User approves → bounces back to `getRedirectUri()` (= `origin + "/p142/"`) with `?code=&state=`.
4. SpotifyContext bootstrap detects the code, validates state, exchanges via `POST /api/token` with `code_verifier`.
5. `saveTokens()` writes `LS_ACCESS_TOKEN`/`LS_REFRESH_TOKEN`/`LS_TOKEN_EXPIRY` and **stamps `LS_OWNER_APP_USER_ID = currentUserId`** (ownership guard).
6. `history.replaceState` to clean URL → `#/home`.

**Refresh**: `setTimeout` 5 min before expiry → `refreshAccessToken` → `saveTokens()` (which dispatches `SPOTIFY_TOKEN_REFRESH_EVENT`; SpotifyContext listens and updates state). Visibility / focus / online events also trigger a refresh check. Distinguishes auth vs transient errors so a flaky network doesn't sign the user out.

**Ownership guard**: on every auth-state settle, if `getOwnerAppUserId() !== currentUserId`, clear Spotify tokens. This ensures Browser-shared-by-two-users doesn't leak Spotify access. Same-user signing back in finds Spotify still connected.

### 7.3 Anonymous → Sign-up redirect

(Only on public app-playlist routes.)
1. Anonymous viewer hits `/app-playlist/:id` → `AppPlaylistView` renders read-only with a Sign-up CTA banner.
2. Click Sign up → `setPostAuthRedirect({returnTo: location.pathname, autoSave: true})` → `navigate('/')`.
3. AppGate re-renders → AuthPage (signed_out).
4. User completes signup → AppGate → `LandingPage` → `consumePostAuthRedirect()` returns the saved intent.
5. LandingPage optionally `savePlaylist(user.id, extractAppPlaylistId(returnTo))`, then `navigate(returnTo, {replace: true})`.

---

## 8. Environment & Build

### `.env` (gitignored — see `.env.local.example`)
```
VITE_SPOTIFY_CLIENT_ID=...        # optional (only Spotify-Linked Mode)
VITE_SUPABASE_URL=...             # required
VITE_SUPABASE_ANON_KEY=...        # required (browser-safe; RLS is the gate)
```

### `vite.config.ts`
- `base: '/p142/'` — required for GitHub Pages deployment under that path.
- `server.host: '127.0.0.1'` — Spotify Dashboard couldn't register `localhost` so the dev server listens on `127.0.0.1`. Redirect URI: **`http://127.0.0.1:5173/p142/`** (trailing slash required, exact match in Dashboard).
- `build.outDir: 'docs'` — GH Pages serves from `docs/`.
- Plugins: `@vitejs/plugin-react`, `@tailwindcss/vite`.

### `index.html`
Loads the Spotify Web Playback SDK from `https://sdk.scdn.co/spotify-player.js`. Sets up a no-op `window.onSpotifyWebPlaybackSDKReady` that `PlayerContext` later overrides.

### Spotify Developer Dashboard
- App must have **Web API** enabled.
- App is in **dev mode** (max 25 allowlisted users + the owner).
- Owner's email must be in "Users and Access".
- Redirect URI: `http://127.0.0.1:5173/p142/` for dev; production GH Pages URL + `/p142/`.

### ESLint
`eslint.config.js` wires in `jsx-a11y` as the WCAG 2.2 AA gate. Specifically enforced: `alt-text`, `label-has-associated-control` (with `Textarea` registered as a control component), `heading-has-content`, `click-events-have-key-events`, `no-static-element-interactions`, `anchor-is-valid`. `dist`, `docs`, `supabase/functions` are globally ignored.

---

## 9. Cross-cutting Conventions / Things That Bit Us

- **Vinyl color palette** lives in `data/vinylColors.ts` (24 colors). Both `spotifyApi.ts` (round-robin assignment) and `appPlaylistsApi.ts` (re-exports for `CreatePlaylistModal`) pull from there — no more manual sync. Adding colors: append, don't reorder.
- **All roads lead to Spotify track IDs.** App-playlist songs reference `spotify_track_id`. Notes target_id is a Spotify id when `target_type='song'`. Even when Spotify isn't connected, the IDs are how rows are identified.
- **Cached metadata, not on-demand fetches.** `app_playlist_songs` carries `title/artist/album/album_art_url/duration_ms`. Owners write the cache when they add a song (using their personal Spotify token); viewers — Spotify-connected or not — render from cache. Required because Client Credentials is locked out of `/v1/tracks` and `/v1/search` in dev mode.
- **Optimistic UI everywhere.** Bookmark toggle, invite accept/decline, song add/remove, annotation save, shuffle toggle — all flip state first and roll back on failure.
- **Modals are hand-rolled.** No shadcn Dialog. Common pattern: backdrop is its own `<button>` (so keyboard users have a Close target and we satisfy `click-events-have-key-events`); the dialog `<form>` is a sibling to avoid bubbling tricks. Escape closes; autofocus on first field.
- **Heading hierarchy:** each page renders a single `<h1>`. Track titles in lists are `<p>`, never `<h3>`/`<h4>`, to keep screen-reader navigation clean.
- **Dual-source player playback.** Spotify playlists use `contextUri: spotify:playlist:{id}` so the SDK plays from the canonical Spotify queue. App-playlists pass `uris: [...]` directly (we have no Spotify URI to hand the SDK). **Both song detail pages (`SongView`, `AppSongView`) ALSO start in the parent playlist's context** rather than as a single-URI play — that way skip-next / skip-prev / on-end-advance work even if the user clicked into a song row without ever hitting Play All. SongView passes `{ contextUri: spotify:playlist:{playlistId}, offsetUri: spotify:track:{songId} }`. AppSongView builds the URI list from `detail.songs` and passes `{ uris, offsetIndex }`.
- **`?edit=1` deep-link** on `/app-playlist/:id` opens directly into edit mode; the param is removed on first effect run so refreshes don't re-force it.
- **Favorite Parts feature** — split data model on purpose: personal favorites live in `song_favorite_parts` (one per user per track), owner-set favorites on annotated playlists live as columns on `app_playlist_songs`. The PlayerContext does NOT fetch — pages push their relevant favorite part into `setCurrentFavoritePart` whenever their visible track is also the one playing, and the bar reads it. v1 limitation: starting playback from `PlaylistView` (Spotify) without ever opening the song page means the NowPlayingBar gets no band (would require a per-track-change Supabase fetch in PlayerContext, not yet wired). Spotify-side row highlights in `PlaylistView` are also deferred (would require bulk-fetching personal parts for every visible row).

---

## 10. Status / What's Done

- [x] Hash-routed SPA with 9 routes (5 protected, 4 public).
- [x] Supabase email+password auth with username-or-email sign-in (`email_for_username` RPC).
- [x] DB trigger materializes `app_users` from signUp metadata.
- [x] AppUserContext state machine (`loading | signed_out | ready | error`).
- [x] Spotify OAuth PKCE login + scheduled refresh + transient-vs-auth error split + ownership guard.
- [x] Spotify Web Playback SDK player wired into a global `NowPlayingBar`.
- [x] HomePage with three filter-pill sections (URL-synced).
- [x] App-native annotated playlists: create / read / update / delete; per-song annotations; cached track metadata.
- [x] Spotify playlist editing (add/remove, search) using `/items` endpoints (Feb-2026 dev-mode migration).
- [x] "Share with SpinDeck" — fork a Spotify playlist into an app_playlist (dedupes via `imported_from_spotify_id`).
- [x] Public anonymous viewing of app_playlist + app_song + profile routes; sign-up CTA with post-auth redirect.
- [x] Library bookmarks (`saved_playlists`).
- [x] Directed invites with autocomplete, message, optimistic accept/decline, auto-save on accept.
- [x] Profile pages (own editable, others read-only) with stats RPC.
- [x] WCAG-friendly: jsx-a11y rules, keyboard-operable cards/rows, `prefers-reduced-motion` honored on the spinning logo.
- [x] **Favorite Parts** — set a `(start, end)` range on a song that you can jump to. Personal on `SongView` (per-user, `song_favorite_parts`), owner-set on `AppSongView` (per song-in-playlist, columns on `app_playlist_songs`). Indicators in three places: song detail page, global `NowPlayingBar` (band + chip), `AppPlaylistView` rows. Three input modes in the editor (slider + mm:ss + "set from current playback position" + clear).
- [x] **Song-detail playback uses playlist context** — clicking play on `SongView` or `AppSongView` (or jumping to a favorite part from those pages) starts the surrounding playlist queue rather than a one-shot single-track play, so skip-next / skip-prev / on-end-advance behave correctly without the user needing to hit Play All first.
- [x] **Vinyl spin animation** — every `<VinylRecord>` spins on hover (via `.group:hover .vinyl-disc` — works on home cards and big header vinyls because both wrap their vinyl in a `.group` element) and continuously while the playlist that owns it is currently playing. Driven by `PlayerContext.currentPlaylistId` + `isPlaying`. Animation pauses (rather than removing) so spin resumes mid-rotation across hover-out. Honors `prefers-reduced-motion`.
- [x] **User-selectable vinyl label style** — four asymmetric marks the user can pick between (`wordmark` curved "SPINDECK", `monogram` "SD", `tick` small triangle, `spokes` clock-tick at 12/6). Stored on `app_users.vinyl_label_style`, applied globally via `AppUserContext`. Picker on `/profile` previews the choice live on the avatar. Required because the vinyl SVG is otherwise rotationally symmetric and the spin animation would be visually invisible.

---

## 11. Known Issues / TODOs

- [ ] `BadgerLayout.tsx` orphaned; `UsernameClaim.tsx` is a dead stub. Both safe to delete from a real shell (sandbox can't unlink).
- [ ] `bootstrap`, `react-bootstrap`, `dotenv`, `express` still in `package.json` — none imported.
- [ ] **`supabase/schema.sql` is behind reality.** Add migrations / regenerate to capture: `app_playlists.imported_from_spotify_id`, `saved_playlists`, `playlist_invites` (+ status enum + partial unique index), `public_user_stats` RPC.
- [ ] `show_dialog=true` forces consent every Spotify login; remove once scope set is stable.
- [ ] HomePage Spotify section caps at 50 (`/me/playlists?limit=50`), no pagination yet.
- [ ] `notes.target_type='spotify_playlist'` is never written by the UI — only `song` (via SongView) and indirectly `app_playlist_songs.annotation` (which is NOT a `notes` row). Either start using it or drop the enum value.
- [ ] `spotifyProxyApi.ts` is defined but inert (dev-mode constraint). Either wire it for the read-only paths it CAN serve, or delete until extended-quota.
- [ ] No global error/toast surface — most pages render error inline; some throw and only show in the console.
- [ ] `ui/Tabs.tsx` is unused. Either consume it (Profile sub-tabs?) or remove.
- [ ] Direct nav to `/playlist/:id` (Spotify) without router state loses the vinyl color and shows the default `#1a1a2e`. Consider deriving color server-side or stashing in localStorage.
- [ ] Username changes are intentionally not exposed. If we ever add them, we'd need to re-key everything that looks up by username (profile URL, invites lookup, etc.).
- [ ] **Favorite Parts v1 gaps**: NowPlayingBar shows no band when the user starts playback from `PlaylistView` (Spotify) without ever opening `SongView` for that track. Spotify-side `PlaylistView` rows get no in-favorite-part highlight either. Both would require new fetches: PlayerContext would need to look up `fetchMyFavoritePart` on every track-change, and PlaylistView would need a batch lookup. Defer until users notice.
- [ ] Favorite-part editor's two stacked range inputs can have overlapping click zones on Firefox (the wider handle wins). Consider a custom slider component if this becomes a real complaint.

---

## 12. Working Process

1. **Always read this doc first**, not the codebase.
2. When making a change that affects a file listed in §5: update that file's bullet here in the same change.
3. When adding a new route: update §4 and §5.2.
4. When adding a new API helper: update §5.1.
5. When adding/altering DB schema: update §6, including the "what's not in v1" list at the top.
6. When changing auth/session behavior: update §7.
7. Bump the "Last updated" date at the top.

If a section grows large enough to be unwieldy, split it into a new file (e.g. `cursor.routes.md`) and link it from here — the goal is "one read instead of thirty," not "one giant file."
