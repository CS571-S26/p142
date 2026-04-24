# SpinDeck — Project State

> **Last updated:** 2026-04-21

## Overview

CS571 (UW-Madison) web project — a music annotation app called **SpinDeck**. Users log in with their Spotify account via OAuth PKCE, browse their real Spotify playlists, view songs, and leave notes/annotations on tracks. Built with Vite + React + TypeScript + Tailwind CSS. Deployed to GitHub Pages under `/p142/`.

## Tech Stack

| Layer       | Tech                                              |
|-------------|---------------------------------------------------|
| Build       | Vite 8, TypeScript ~5.9                           |
| UI          | React 19, React DOM 19                            |
| Routing     | react-router-dom 7 (`createHashRouter`)           |
| Styling     | Tailwind CSS 4.2 (via `@tailwindcss/vite` plugin) |
| Icons       | lucide-react 1.7                                  |
| Auth        | Spotify OAuth 2.0 PKCE (browser-only, no backend) |
| Lint        | ESLint 9, typescript-eslint, React Hooks plugin    |
| Deploy      | `docs/` output dir, `base: '/p142/'` in Vite config |

**Unused deps still in `package.json`:** `bootstrap`, `react-bootstrap`, `dotenv`, `express` — none are imported anywhere.

## File Structure

```
webproject/
├── .env                                # VITE_SPOTIFY_CLIENT_ID (gitignored)
├── .gitignore                          # Includes .env, .env.local, .env.*.local
├── index.html
├── package.json
├── vite.config.ts                      # base: '/p142/', host: '127.0.0.1', outDir: 'docs', tailwindcss plugin
├── tsconfig.json / .app.json / .node.json
├── eslint.config.js
├── cursor.md                           # THIS FILE
├── public/
│   └── icons.svg
├── docs/                               # Production build output (do not edit)
└── src/
    ├── main.tsx                        # React entry, imports index.css, renders <App />
    ├── index.css                       # Tailwind CSS entry (@import "tailwindcss")
    ├── assets/
    │   ├── react.svg                   # Default Vite asset (unused)
    │   └── vite.svg                    # Default Vite asset (unused)
    ├── structural/
    │   ├── App.tsx                     # createHashRouter, wraps with SpotifyProvider
    │   └── BadgerLayout.tsx            # ORPHANED — old navbar layout, not used by any route
    └── components/
        ├── data/
        │   ├── spotifyAuth.ts         # PKCE utilities: redirect, token exchange, refresh, localStorage helpers
        │   ├── SpotifyContext.tsx      # React context: login(), logout(), token, isConnected, isLoading, auto-refresh
        │   ├── spotifyApi.ts          # Spotify Web API helpers with 401 retry logic
        │   └── mockData.ts           # TypeScript types (Song, Playlist, Note) + mock playlists/notes (mostly unused now)
        └── pages/
            ├── LandingPage.tsx        # "/" — spinning vinyl, "Login with Spotify" button
            ├── HomePage.tsx           # "/home" — fetches & shows real Spotify playlists as vinyl cards
            ├── PlaylistView.tsx       # "/playlist/:playlistId" — playlist header + song list
            ├── SongView.tsx           # "/playlist/:playlistId/song/:songId" — song detail + notes
            ├── VinylRecord.tsx        # SVG vinyl record component (color, size props)
            └── ui/
                ├── button.tsx         # Reusable Button (variants: default, ghost, outline)
                └── textarea.tsx       # Reusable Textarea
```

## Routing (HashRouter)

| Path | Component | Description |
|------|-----------|-------------|
| `/` | `LandingPage` | Hero page with spinning vinyl + "Login with Spotify" button |
| `/home` | `HomePage` | Grid of user's real Spotify playlists (vinyl card per playlist) |
| `/playlist/:playlistId` | `PlaylistView` | Playlist header (name, vinyl, song count) + song list |
| `/playlist/:playlistId/song/:songId` | `SongView` | Song detail (album art, metadata, duration) + notes UI |

HomePage passes playlist metadata (name, description, vinylColor, songCount) to PlaylistView via React Router `state`.

## Auth Flow (OAuth 2.0 PKCE)

**File:** `spotifyAuth.ts`

1. User clicks "Login with Spotify" on LandingPage
2. `redirectToSpotifyAuth()` generates `code_verifier` (64 chars) + `code_challenge` (SHA-256 base64url)
3. Stores `code_verifier` + `state` in `sessionStorage`, redirects to Spotify `/authorize`
4. Params include `show_dialog=true` to force consent screen (ensures latest scopes)
5. User approves on Spotify, redirected back to app with `?code=...&state=...`
6. `SpotifyContext` detects `code` in `window.location.search` on mount
7. Exchanges code for `access_token` + `refresh_token` via POST to Spotify `/api/token`
8. Tokens stored in `localStorage`; URL cleaned to `#/home`
9. Auto-refresh: `setTimeout` fires 5 min before token expiry, silently refreshes
10. `spotifyApi.ts` also retries once on 401 by attempting a token refresh

**Scopes:** `playlist-read-private`, `playlist-read-collaborative`, `playlist-modify-private`, `playlist-modify-public`, `user-library-read`, `user-read-private`, `user-read-email`, `streaming`, `user-modify-playback-state`

The two `playlist-modify-*` scopes were added on 2026-04-21 to enable in-app playlist editing. Users authorized before that date must log out and log in again for the new scopes to be granted.

**Storage:**
- `sessionStorage`: `spotify_code_verifier`, `spotify_auth_state` (only during redirect round-trip)
- `localStorage`: `spotify_access_token`, `spotify_refresh_token`, `spotify_token_expiry`

**Redirect URI:** `window.location.origin + "/p142/"` (derived at runtime)
- Dev: `http://127.0.0.1:5173/p142/` (must match Spotify Dashboard exactly, trailing slash required)
- Prod: GitHub Pages URL + `/p142/`

**IMPORTANT:** The Vite dev server is configured with `host: '127.0.0.1'` because `localhost` could not be registered as a redirect URI in the Spotify Dashboard.

## SpotifyContext (`SpotifyContext.tsx`)

Provides to all components via `useSpotify()`:
- `token: string` — current access token (empty if not connected)
- `isConnected: boolean` — `!!token`
- `isLoading: boolean` — true while checking for existing session on mount
- `login(): Promise<void>` — triggers redirect to Spotify authorize
- `logout(): void` — clears tokens from localStorage, resets state

On mount:
1. Checks `window.location.search` for `?code=` → exchanges for tokens → navigates to `#/home`
2. If no code: checks `localStorage` for valid tokens → restores session
3. If token expired but refresh token exists → silently refreshes

## Spotify API Integration (`spotifyApi.ts`)

**Base URL:** `https://api.spotify.com/v1`

### Endpoints Used

| Function | Endpoint | Returns |
|----------|----------|---------|
| `fetchUserPlaylists(token)` | `GET /me/playlists?limit=20` | `Playlist[]` |
| `fetchPlaylistDetail(token, id)` | `GET /playlists/{id}` (paginates `next`) | `PlaylistDetail` (name, description, songCount, songs, ownerId, ownerName, collaborative) |
| `fetchTrack(token, id)` | `GET /tracks/{id}` | `Song` |
| `fetchCurrentUser(token)` | `GET /me` | `{ id, displayName }` — used by PlaylistView to decide whether the current user owns the playlist (and thus can edit) |
| `searchTracks(token, query, limit?)` | `GET /search?q=…&type=track` | `Song[]` — debounced from PlaylistView's edit-mode search box |
| `addTracksToPlaylist(token, id, uris)` | `POST /playlists/{id}/items`, body `{ uris: [...] }` | `void` (batches of up to 100 URIs) |
| `removeTracksFromPlaylist(token, id, uris)` | `DELETE /playlists/{id}/items`, body `{ items: [{ uri }] }` | `void` (batches of up to 100) |
| `startPlayback(token, deviceId, options)` | `PUT /me/player/play?device_id=…` | `void` |

### Spotify API Quirks for Newer Apps (post Nov 2024 / Feb 2026 migration)

- **Field rename (Nov 2024):** In `/me/playlists` response, each playlist has `items: { total: N }` instead of the documented `tracks: { total: N }`. Code handles both with `p.items?.total ?? p.tracks?.total ?? 0`.
- **February 2026 dev-mode migration:** Spotify renamed several playlist-track endpoints from `/tracks` to `/items` for development-mode apps. The old paths now return a bare `403 Forbidden` (no `www-authenticate`, no reason field). The app uses the new paths everywhere:
  - `POST /playlists/{id}/items` — add, body `{ uris: [...] }` (POST still accepts `uris`)
  - `DELETE /playlists/{id}/items` — remove, body `{ items: [{ uri }] }` (the old `{ tracks: [{ uri }] }` shape and the `?uris=` query-param form both fail on the new endpoint; it specifically wants `items`)
  - Reads still happen through `GET /playlists/{id}` (which returns the tracks inline) + the `next` pagination URL Spotify supplies; no migration needed there.
- **Restricted playlists:** Spotify-owned algorithmic/editorial playlists (Discover Weekly, Daily Mix, Release Radar, etc.) return 403 for apps in development mode. PlaylistView shows a friendly "This playlist is restricted" message for 403 errors.
- **Ownership required for edits:** Spotify only allows modifying playlists the authenticated user owns (or collaborative ones they're a collaborator on). PlaylistView greys out the Edit button with an explanatory tooltip for playlists the current user doesn't own; the check is `detail.ownerId === currentUserId || detail.collaborative`.
- The full playlist response from `GET /playlists/{id}` uses either `tracks` or `items` as the key for the track listing. Code checks `data.tracks ?? data.items` and paginates via `next` to load playlists with more than 100 tracks.

### 401 Retry Logic

`spotifyFetch()` intercepts 401 responses, attempts a token refresh using the stored refresh token, and retries the request once. On failure, clears tokens and throws "Session expired."

### Vinyl Colors

Playlists are assigned colors from a 12-color palette based on their index in the list. The color is passed from HomePage → PlaylistView via React Router state.

## Data Model

### Types (defined in `mockData.ts`)

```typescript
interface Song {
  id: string;          // Spotify track ID
  title: string;
  artist: string;      // comma-separated if multiple
  album: string;
  albumArt: string;    // URL to album cover image
  noteCount: number;   // always 0 from Spotify (notes are app-specific)
  favoriteCount: number; // always 0 from Spotify
  duration: string;    // formatted as "M:SS"
  uri?: string;        // Spotify track URI (e.g. "spotify:track:...") — needed for add/remove
}

interface Playlist {
  id: string;          // Spotify playlist ID
  name: string;
  description: string;
  vinylColor: string;  // hex color assigned by app
  songCount: number;
  songs: Song[];       // empty in listing, populated in detail view
}

interface Note {
  id: string;
  userName: string;
  timestamp: string;
  likes: number;
  content: string;
}
```

### Additional API Type (`spotifyApi.ts`)

```typescript
interface PlaylistDetail {
  name: string;
  description: string;
  songCount: number;
  songs: Song[];
  ownerId: string;        // Spotify user ID of the playlist owner
  ownerName: string;      // owner's display name (may be empty)
  collaborative: boolean; // if true, anyone invited can edit
}

interface CurrentUser {
  id: string;
  displayName: string;
}
```

### Mock Data (mostly vestigial)

`mockData.ts` still contains:
- `mockPlaylists` — 3 hardcoded playlists (no longer used by any page)
- `mockNotes` — keyed by song ID, only `s1` and `s4` have notes. Still used by `SongView` for the notes section, but since real Spotify track IDs won't match `s1`/`s4`, notes always appear empty for real songs.

## Component Details

### LandingPage (`/`)
- Spinning vinyl record animation (8s rotation)
- "Login with Spotify" button → calls `login()` from context (redirects to Spotify)
- If already connected, button says "Go to Playlists" and navigates to `/home`
- Shows "Loading..." while context checks for existing session

### HomePage (`/home`)
- Fetches playlists via `fetchUserPlaylists(token)` on mount
- Displays as 1-3 column responsive grid of vinyl record cards
- Each card: VinylRecord SVG + playlist name + description + song count
- Click navigates to `/playlist/{id}` with state (name, description, vinylColor, songCount)
- Loading, error, and empty states handled

### PlaylistView (`/playlist/:playlistId`)
- Reads route state for immediate display of name, vinyl color, song count
- Fetches full playlist detail via `fetchPlaylistDetail(token, playlistId)` (now paginates via `next` for playlists > 100 tracks)
- Fetches `/me` via `fetchCurrentUser` in parallel to decide edit permissions
- Header: VinylRecord (color from route state) + playlist name + "N songs • by Owner"
- "Play All" (when Spotify player is ready) plus an **Edit** button
  - Edit button is enabled only when `ownerId === currentUserId || collaborative`
  - When disabled, it greys out and a hover tooltip explains why ("Only X can edit this playlist…")
- **Edit mode** (toggled by clicking Edit, exited with Done):
  - Adds an "Add songs" panel above the track list with a debounced (300 ms) Spotify track search. Each result row shows album art + title + artist and an Add button; tracks already in the playlist render as disabled "Added" instead.
  - Each existing song row gets a trash-icon Remove button. Play-all / row-click navigation is suppressed while editing to avoid mis-clicks.
  - Add/remove calls refetch the playlist afterwards so the UI reflects the latest state.
- Song list (when not editing): numbered rows with title, artist, note count icon, duration. Click → navigates to `/playlist/{playlistId}/song/{songId}`.
- 403 errors show "This playlist is restricted" with explanation.

### SongView (`/playlist/:playlistId/song/:songId`)
- Fetches individual track via `fetchTrack(token, songId)`
- Displays: album art, title, artist, album name, duration
- Notes section: lists notes from `mockNotes` (always empty for real Spotify tracks since IDs don't match)
- Add Note form: textarea + Post/Cancel buttons (local state only, doesn't persist)
- Loading and error states handled

### VinylRecord
- Pure SVG component with configurable `color` and `size` props
- Renders: outer disc, groove rings, white label, center hole

### UI Components (`ui/`)
- **Button:** `forwardRef`, supports `variant` prop (`default`, `ghost`, `outline`), Tailwind classes
- **Textarea:** `forwardRef`, full-width with focus ring, placeholder styling

## Environment & Config

### `.env` (gitignored)
```
VITE_SPOTIFY_CLIENT_ID='c3fbe199a8024683bd1df8a198e5dc12'
```

### `vite.config.ts`
- `base: '/p142/'` — required for GitHub Pages deployment path
- `server.host: '127.0.0.1'` — required because Spotify Dashboard couldn't register `localhost`
- `build.outDir: 'docs'` — GitHub Pages serves from `docs/`
- Plugins: `@vitejs/plugin-react`, `@tailwindcss/vite`

### Spotify Developer Dashboard
- App must have **"Web API"** selected under APIs
- App is in **development mode** (limited to owner + 25 registered users)
- Owner's Spotify email must be in "Users and Access"
- Redirect URI: `http://127.0.0.1:5173/p142/` (exact match, trailing slash required)

## Current Status / What's Done

- [x] Full page structure: Landing → Home → Playlist → Song
- [x] Hash-based routing with all 4 routes
- [x] Tailwind CSS styling throughout
- [x] VinylRecord SVG component with configurable color
- [x] Spotify OAuth PKCE login flow (no backend, no static token)
- [x] Automatic token refresh (silent, 5 min before expiry)
- [x] 401 retry logic in API layer
- [x] HomePage fetches and displays real Spotify playlists with song counts
- [x] PlaylistView shows playlist name and song count from Spotify
- [x] Vinyl color carried from HomePage to PlaylistView via router state
- [x] SongView fetches individual track metadata from Spotify
- [x] Notes UI with add-note form (local state only)
- [x] .env gitignored, redirect URIs configured
- [x] Friendly error messages for restricted (403) playlists
- [x] Playlist track list pagination (walks the `next` URL so playlists > 100 tracks load fully)
- [x] **Playlist editing** — add & remove songs in-app, gated by ownership (2026-04-21)
- [x] Spotify track search (debounced) inside playlist edit mode
- [x] Migration to `/playlists/{id}/items` endpoints for the Feb 2026 dev-mode API change
- [x] Logout button wired into PlaylistView header

## Known Bugs

_None blocking at the moment._ The previous "playlist songs list always empty" bug was resolved when `fetchPlaylistDetail` was changed to prefer `data.tracks ?? data.items` and paginate via `next`.

## Known Issues / TODOs

- [ ] `BadgerLayout.tsx` is orphaned — not used by any route
- [ ] `bootstrap`, `react-bootstrap`, `dotenv`, `express` in package.json but unused
- [ ] `show_dialog=true` forces consent screen every login — should remove after scopes are stable (kept on for now since the modify scopes were just added and we want users to re-prompt)
- [ ] **Notes don't persist** — add-note form is local state only; needs a backend (see "Planned: Notes Backend" below)
- [ ] `mockNotes` in `mockData.ts` is keyed by fake IDs (`s1`, `s4`) — always empty for real Spotify tracks; will be replaced when the notes backend lands
- [ ] SongView navigating back to playlist loses router state (no name/color on direct nav)
- [ ] Home page only fetches first 20 playlists (`limit=20`, no pagination)
- [ ] `mockData.ts` exports `mockPlaylists` which are no longer used by any page
- [ ] No global error/toast surface — edit errors show inline in the add-songs panel but other pages throw

## Planned: Notes Backend

Upcoming feature — persist user notes on songs and playlists. Requirements the backend needs to support:
- Create / read / update / delete a note attached to a `(userId, spotifyTrackId)` or `(userId, spotifyPlaylistId)` pair
- List all notes for a given song or playlist (for rendering counts on the playlist view)
- Authenticate the caller (likely by validating the user's Spotify access token on the server, or by issuing our own app JWT after a first-time Spotify login)
- Sensibly cheap / free for a class project

See the conversation thread dated 2026-04-21 for the option comparison and chosen approach.
