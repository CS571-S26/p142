import { supabase } from "./supabaseClient";
import type { Song } from "./mockData";

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

// Matches the vinyl-color palette we use elsewhere in the app.
export const VINYL_COLORS = [
  "#1a1a2e", "#16213e", "#0f3460", "#e94560",
  "#533483", "#2b2d42", "#8d99ae", "#d90429",
  "#006d77", "#e29578", "#264653", "#2a9d8f",
];

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
      "playlist_id, position, spotify_track_id, annotation, added_at, title, artist, album, album_art_url, duration_ms"
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
      "playlist_id, position, spotify_track_id, annotation, added_at, title, artist, album, album_art_url, duration_ms"
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
