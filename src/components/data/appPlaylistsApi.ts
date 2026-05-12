import { supabase } from "./supabaseClient";
import type { Song } from "./types";

// ---------------------------------------------------------------------------
// appPlaylistsApi — CRUD for SpinDeck-native annotated playlists.
// ---------------------------------------------------------------------------
// Playlists are rows in `app_playlists`; songs are rows in
// `app_playlist_songs` keyed by (playlist_id, position).
//
// Track metadata (title, artist, album, cover, duration_ms) is CACHED on
// the song row at the time it's added. Two reasons:
//
//   1. Spotify's dev-mode API restrictions block Client Credentials calls
//      to /v1/tracks and /v1/search, which killed our original plan of
//      hydrating through an Edge Function proxy.
//   2. Caching means viewing a playlist is a single Supabase query and
//      works for Public-Mode users with no Spotify login at all — which
//      is exactly the "share annotated playlists with anyone" story.
//
// All writes go through RLS (owner_id = auth.uid()), so the DB is the
// authoritative ownership check; client-side guards here are purely UX.
// ---------------------------------------------------------------------------

// Re-export the shared palette so callers that already pull
// VINYL_COLORS from here (CreatePlaylistModal) don't have to change
// their imports. Single source of truth lives in `./vinylColors`.
export { VINYL_COLORS } from "./vinylColors";
import { VINYL_COLORS } from "./vinylColors";

export interface AppPlaylistSummary {
  id: string;
  ownerId: string;
  name: string;
  description: string;
  vinylColor: string;
  isPublic: boolean;
  songCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface AppPlaylistSong {
  position: number;
  trackId: string;
  annotation: string | null;
  addedAt: string;
  // Owner-set favorite part for this song *in this playlist*. Both null
  // when the owner hasn't set one. When set, both are non-null and
  // start < end (DB CHECK enforces the same invariant).
  favoriteStartMs: number | null;
  favoriteEndMs: number | null;
  song: Song; // from cached columns on the row
}

export interface AppPlaylistDetail extends AppPlaylistSummary {
  songs: AppPlaylistSong[];
  ownerUsername: string | null;
  ownerDisplayName: string | null;
}

// DB row shapes (snake_case, as returned by Supabase).
interface PlaylistRow {
  id: string;
  owner_id: string;
  name: string;
  description: string;
  vinyl_color: string;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

interface PlaylistRowWithCount extends PlaylistRow {
  // PostgREST returns count-aggregated embeddings as [{ count: N }].
  app_playlist_songs?: { count: number }[] | null;
}

interface SongRow {
  playlist_id: string;
  position: number;
  spotify_track_id: string;
  annotation: string | null;
  added_at: string;
  // Cached metadata (see migration 004). Nullable because very old rows
  // may predate the cache.
  title: string | null;
  artist: string | null;
  album: string | null;
  album_art_url: string | null;
  duration_ms: number | null;
  // Owner-set favorite part. Added by the favorite-parts migration.
  // Either both null or both non-null with start < end (DB CHECK).
  favorite_start_ms: number | null;
  favorite_end_ms: number | null;
}

function rowToSummary(row: PlaylistRow, songCount: number): AppPlaylistSummary {
  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    description: row.description,
    vinylColor: row.vinyl_color,
    isPublic: row.is_public,
    songCount,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function formatDuration(ms: number): string {
  if (!ms || ms <= 0) return "";
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

// Build the display-ready Song from the cached columns on the row. Missing
// cached data (pre-migration rows, or rows written before metadata caching
// existed) surfaces as "(track unavailable)" so the UI doesn't silently
// drop the entry.
function rowToSong(row: SongRow): Song {
  const hasAnyMetadata =
    !!row.title || !!row.artist || !!row.album || !!row.album_art_url;
  return {
    id: row.spotify_track_id,
    title: row.title ?? (hasAnyMetadata ? "(untitled)" : "(track unavailable)"),
    artist: row.artist ?? "",
    album: row.album ?? "",
    albumArt: row.album_art_url ?? "",
    noteCount: 0,
    favoriteCount: 0,
    duration: formatDuration(row.duration_ms ?? 0),
    durationMs: row.duration_ms ?? undefined,
    uri: `spotify:track:${row.spotify_track_id}`,
  };
}

function rowToPlaylistSong(row: SongRow): AppPlaylistSong {
  return {
    position: row.position,
    trackId: row.spotify_track_id,
    annotation: row.annotation,
    addedAt: row.added_at,
    favoriteStartMs: row.favorite_start_ms,
    favoriteEndMs: row.favorite_end_ms,
    song: rowToSong(row),
  };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

// List all playlists owned by the given user, newest first, with a cheap
// song-count aggregate so the home grid can render "N songs" without
// fetching the full song list for each card.
export async function listMyPlaylists(
  ownerId: string
): Promise<AppPlaylistSummary[]> {
  const { data, error } = await supabase
    .from("app_playlists")
    .select(
      "id, owner_id, name, description, vinyl_color, is_public, created_at, updated_at, app_playlist_songs(count)"
    )
    .eq("owner_id", ownerId)
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return (data as unknown as PlaylistRowWithCount[]).map((row) => {
    const count = row.app_playlist_songs?.[0]?.count ?? 0;
    return rowToSummary(row, count);
  });
}

// Fetch one playlist with songs and owner info. Everything comes from the
// DB — no external service calls — so this works for any viewer, Spotify
// or not.
export async function fetchPlaylist(
  playlistId: string
): Promise<AppPlaylistDetail> {
  const { data: playlistRaw, error: pErr } = await supabase
    .from("app_playlists")
    .select(
      "id, owner_id, name, description, vinyl_color, is_public, created_at, updated_at, owner:app_users!app_playlists_owner_id_fkey(username, display_name)"
    )
    .eq("id", playlistId)
    .single();

  if (pErr) throw pErr;
  const playlist = playlistRaw as unknown as PlaylistRow & {
    owner: { username: string; display_name: string | null } | null;
  };

  const { data: songsRaw, error: sErr } = await supabase
    .from("app_playlist_songs")
    .select(
      "playlist_id, position, spotify_track_id, annotation, added_at, title, artist, album, album_art_url, duration_ms, favorite_start_ms, favorite_end_ms"
    )
    .eq("playlist_id", playlistId)
    .order("position", { ascending: true });

  if (sErr) throw sErr;
  const songRows = (songsRaw ?? []) as SongRow[];
  const songs = songRows.map(rowToPlaylistSong);

  return {
    ...rowToSummary(playlist, songRows.length),
    songs,
    ownerUsername: playlist.owner?.username ?? null,
    ownerDisplayName: playlist.owner?.display_name ?? null,
  };
}

// ---------------------------------------------------------------------------
// Create / update / delete playlist
// ---------------------------------------------------------------------------

export async function createPlaylist(input: {
  ownerId: string;
  name: string;
  description?: string;
  vinylColor?: string;
  isPublic?: boolean;
}): Promise<AppPlaylistSummary> {
  const name = input.name.trim();
  if (!name) throw new Error("Playlist name can't be empty.");
  if (name.length > 80) throw new Error("Playlist name is too long (max 80 chars).");

  const { data, error } = await supabase
    .from("app_playlists")
    .insert({
      owner_id: input.ownerId,
      name,
      description: input.description?.trim() ?? "",
      vinyl_color: input.vinylColor ?? VINYL_COLORS[0],
      is_public: input.isPublic ?? true,
    })
    .select("id, owner_id, name, description, vinyl_color, is_public, created_at, updated_at")
    .single();

  if (error) throw error;
  return rowToSummary(data as PlaylistRow, 0);
}

export async function updatePlaylist(
  playlistId: string,
  patch: {
    name?: string;
    description?: string;
    vinylColor?: string;
    isPublic?: boolean;
  }
): Promise<AppPlaylistSummary> {
  const dbPatch: Record<string, unknown> = {};
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name) throw new Error("Playlist name can't be empty.");
    if (name.length > 80) throw new Error("Playlist name is too long (max 80 chars).");
    dbPatch.name = name;
  }
  if (patch.description !== undefined) dbPatch.description = patch.description.trim();
  if (patch.vinylColor !== undefined) dbPatch.vinyl_color = patch.vinylColor;
  if (patch.isPublic !== undefined) dbPatch.is_public = patch.isPublic;

  const { data, error } = await supabase
    .from("app_playlists")
    .update(dbPatch)
    .eq("id", playlistId)
    .select("id, owner_id, name, description, vinyl_color, is_public, created_at, updated_at")
    .single();

  if (error) throw error;
  // We don't know the current song count from this response; callers that
  // care can refetch. For the common "rename in edit mode" case, we don't
  // need the count.
  return rowToSummary(data as PlaylistRow, 0);
}

export async function deletePlaylist(playlistId: string): Promise<void> {
  const { error } = await supabase
    .from("app_playlists")
    .delete()
    .eq("id", playlistId);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Songs: add / remove / annotate
// ---------------------------------------------------------------------------
// Position is a dense, 0-indexed order. On add, we write at `max(position)+1`
// with a best-effort read-then-insert (cheap, rare contention). On remove,
// we re-pack the remaining rows so there are no gaps.
// ---------------------------------------------------------------------------

async function nextPosition(playlistId: string): Promise<number> {
  const { data, error } = await supabase
    .from("app_playlist_songs")
    .select("position")
    .eq("playlist_id", playlistId)
    .order("position", { ascending: false })
    .limit(1);
  if (error) throw error;
  const highest = data?.[0]?.position;
  return typeof highest === "number" ? highest + 1 : 0;
}

// Add a song to the playlist, caching its metadata. Caller passes the full
// Song (from a Spotify search result) so we can persist title/artist/etc.
// onto the row. That snapshot is what every viewer — Spotify or not —
// renders later.
export async function addSong(input: {
  playlistId: string;
  song: Song;
  addedBy: string;
  annotation?: string | null;
}): Promise<AppPlaylistSong> {
  const position = await nextPosition(input.playlistId);
  const annotation = input.annotation?.trim() ? input.annotation.trim() : null;
  const { song } = input;

  const { data, error } = await supabase
    .from("app_playlist_songs")
    .insert({
      playlist_id: input.playlistId,
      position,
      spotify_track_id: song.id,
      added_by: input.addedBy,
      annotation,
      title: song.title || null,
      artist: song.artist || null,
      album: song.album || null,
      album_art_url: song.albumArt || null,
      duration_ms: typeof song.durationMs === "number" ? song.durationMs : null,
    })
    .select(
      "playlist_id, position, spotify_track_id, annotation, added_at, title, artist, album, album_art_url, duration_ms, favorite_start_ms, favorite_end_ms"
    )
    .single();

  if (error) throw error;
  return rowToPlaylistSong(data as SongRow);
}

// Remove a song at a given position, then re-pack positions >= position-1.
// We read+write explicitly (instead of a single UPDATE) because the
// composite-PK constraint on (playlist_id, position) means in-place
// decrement can collide; doing it client-side one row at a time keeps the
// SQL simple and works fine at playlist-scale.
export async function removeSong(input: {
  playlistId: string;
  position: number;
}): Promise<void> {
  const { error: delErr } = await supabase
    .from("app_playlist_songs")
    .delete()
    .eq("playlist_id", input.playlistId)
    .eq("position", input.position);
  if (delErr) throw delErr;

  const { data: rest, error: readErr } = await supabase
    .from("app_playlist_songs")
    .select("position")
    .eq("playlist_id", input.playlistId)
    .gt("position", input.position)
    .order("position", { ascending: true });
  if (readErr) throw readErr;

  // Shift each row down by one. We update from the lowest up (they're
  // already ordered), so each new position is guaranteed unused.
  for (const row of (rest ?? []) as { position: number }[]) {
    const { error: upErr } = await supabase
      .from("app_playlist_songs")
      .update({ position: row.position - 1 })
      .eq("playlist_id", input.playlistId)
      .eq("position", row.position);
    if (upErr) throw upErr;
  }
}

export async function updateAnnotation(input: {
  playlistId: string;
  position: number;
  annotation: string | null;
}): Promise<void> {
  const cleaned = input.annotation?.trim();
  const value = cleaned && cleaned.length > 0 ? cleaned : null;
  if (value && value.length > 2000) {
    throw new Error("Annotation is too long (max 2000 chars).");
  }
  const { error } = await supabase
    .from("app_playlist_songs")
    .update({ annotation: value })
    .eq("playlist_id", input.playlistId)
    .eq("position", input.position);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Owner-set favorite part — write to the favorite_start_ms / favorite_end_ms
// columns on app_playlist_songs.
// ---------------------------------------------------------------------------
// Pass `startMs = endMs = null` to clear. Otherwise both are required and
// must satisfy `startMs >= 0 && endMs > startMs`. RLS already restricts
// updates to the playlist owner, so the caller doesn't need to pass an
// auth identity — the DB rejects mismatches.
// ---------------------------------------------------------------------------
export async function updateAppPlaylistFavoritePart(input: {
  playlistId: string;
  position: number;
  startMs: number | null;
  endMs: number | null;
}): Promise<void> {
  // Either-both-null is "clear", either-both-non-null is "set". Anything
  // else is meaningless; bounce it before round-tripping the DB.
  if ((input.startMs === null) !== (input.endMs === null)) {
    throw new Error(
      "Favorite part requires both start and end (or both null to clear)."
    );
  }

  // Round to integer ms — the DB columns are INTEGER and Postgres
  // rejects floats with `invalid input syntax for type integer` (a
  // pointer-driven slider in the editor was sending fractional ms).
  // Defense-in-depth: the editor also rounds at source.
  const startMs =
    input.startMs === null ? null : Math.max(0, Math.round(input.startMs));
  const endMs =
    input.endMs === null ? null : Math.round(input.endMs);

  if (startMs !== null && endMs !== null) {
    if (endMs <= startMs) {
      throw new Error("Favorite part end must come after start.");
    }
  }

  const { error } = await supabase
    .from("app_playlist_songs")
    .update({
      favorite_start_ms: startMs,
      favorite_end_ms: endMs,
    })
    .eq("playlist_id", input.playlistId)
    .eq("position", input.position);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Import a Spotify playlist as a SpinDeck snapshot.
// ---------------------------------------------------------------------------
// "Share with SpinDeck" on a Spotify-sourced playlist runs this. It forks the
// playlist into our own tables — name, description, and the full track list
// (with metadata cached the same way addSong caches it) — so the result
// behaves exactly like a hand-built SpinDeck playlist: shareable, save-able,
// invitable, annotatable.
//
// Re-importing the same Spotify playlist by the same user is a no-op: we
// look up the previous snapshot via (owner_id, imported_from_spotify_id)
// and return its id. This lets the UI flip the button from "Share with
// SpinDeck" to "Open SpinDeck copy" once an import exists, with no risk
// of users accidentally piling up duplicates.
//
// We intentionally do NOT keep the snapshot in sync with Spotify. If the
// owner of the Spotify playlist adds tracks later, those won't show up
// here unless the user explicitly re-imports — and even then, today's
// implementation reuses the existing snapshot rather than refreshing it.
// ---------------------------------------------------------------------------

// Returns the existing imported app_playlist id for this (owner, source)
// pair, or null if the user hasn't imported this Spotify playlist yet.
export async function findImportedSpotifyPlaylist(input: {
  ownerId: string;
  spotifyPlaylistId: string;
}): Promise<string | null> {
  const { data, error } = await supabase
    .from("app_playlists")
    .select("id")
    .eq("owner_id", input.ownerId)
    .eq("imported_from_spotify_id", input.spotifyPlaylistId)
    .maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}

export async function importSpotifyPlaylist(input: {
  ownerId: string;
  spotifyPlaylistId: string;
  name: string;
  description?: string;
  vinylColor?: string;
  songs: Song[];
}): Promise<string> {
  // 1) Reuse path — does a snapshot already exist for this user?
  const existing = await findImportedSpotifyPlaylist({
    ownerId: input.ownerId,
    spotifyPlaylistId: input.spotifyPlaylistId,
  });
  if (existing) return existing;

  // 2) Otherwise, create a new app_playlist row tagged with the source.
  const name = (input.name || "").trim() || "Imported playlist";
  const description = (input.description ?? "").trim();
  const vinylColor = input.vinylColor ?? VINYL_COLORS[0];

  const { data: created, error: insertErr } = await supabase
    .from("app_playlists")
    .insert({
      owner_id: input.ownerId,
      name: name.slice(0, 80),
      description,
      vinyl_color: vinylColor,
      is_public: true,
      imported_from_spotify_id: input.spotifyPlaylistId,
    })
    .select("id")
    .single();

  if (insertErr) throw insertErr;
  const playlistId = (created as { id: string }).id;

  // 3) Bulk-insert songs with their cached metadata. Positions are dense
  // and 0-indexed, matching addSong's ordering convention.
  if (input.songs.length > 0) {
    const rows = input.songs.map((song, i) => ({
      playlist_id: playlistId,
      position: i,
      spotify_track_id: song.id,
      added_by: input.ownerId,
      annotation: null,
      title: song.title || null,
      artist: song.artist || null,
      album: song.album || null,
      album_art_url: song.albumArt || null,
      duration_ms: typeof song.durationMs === "number" ? song.durationMs : null,
    }));

    const { error: songsErr } = await supabase
      .from("app_playlist_songs")
      .insert(rows);

    if (songsErr) {
      // Best-effort cleanup so a half-imported playlist doesn't litter the
      // user's library if the songs insert fails. RLS already restricts
      // delete to owner_id = auth.uid(), which is the same user who just
      // ran the insert above, so this is allowed.
      await supabase.from("app_playlists").delete().eq("id", playlistId);
      throw songsErr;
    }
  }

  return playlistId;
}
