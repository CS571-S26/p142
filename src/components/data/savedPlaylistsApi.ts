import { supabase } from "./supabaseClient";
import type { AppPlaylistSummary } from "./appPlaylistsApi";

// ---------------------------------------------------------------------------
// savedPlaylistsApi — thin CRUD over the `saved_playlists` join table.
// ---------------------------------------------------------------------------
// "Saving" a playlist is a live bookmark — we just record the pointer; we
// never copy tracks or annotations. The recipient always reads the
// canonical playlist row, so any later edits the owner makes are visible
// immediately.
//
// All writes are gated by RLS (`user_id = auth.uid()`); we still pass the
// userId here so the API surface is symmetric with the rest of the data
// layer and so callers don't have to reach into the auth context just to
// flip a bookmark.
// ---------------------------------------------------------------------------

interface SavedRow {
  user_id: string;
  playlist_id: string;
  saved_at: string;
}

interface PlaylistRowFromSave {
  id: string;
  owner_id: string;
  name: string;
  description: string;
  vinyl_color: string;
  is_public: boolean;
  created_at: string;
  updated_at: string;
  app_playlist_songs?: { count: number }[] | null;
}

interface SavedJoinRow {
  saved_at: string;
  app_playlists: PlaylistRowFromSave | null;
}

function joinRowToSummary(row: SavedJoinRow): AppPlaylistSummary | null {
  const pl = row.app_playlists;
  if (!pl) return null;
  const count = pl.app_playlist_songs?.[0]?.count ?? 0;
  return {
    id: pl.id,
    ownerId: pl.owner_id,
    name: pl.name,
    description: pl.description,
    vinylColor: pl.vinyl_color,
    isPublic: pl.is_public,
    songCount: count,
    createdAt: pl.created_at,
    updatedAt: pl.updated_at,
  };
}

// Bookmark a playlist for this user. Idempotent: if the row already
// exists, the upsert no-ops instead of erroring.
export async function savePlaylist(
  userId: string,
  playlistId: string
): Promise<void> {
  const { error } = await supabase
    .from("saved_playlists")
    .upsert(
      { user_id: userId, playlist_id: playlistId },
      { onConflict: "user_id,playlist_id", ignoreDuplicates: true }
    );
  if (error) throw error;
}

export async function unsavePlaylist(
  userId: string,
  playlistId: string
): Promise<void> {
  const { error } = await supabase
    .from("saved_playlists")
    .delete()
    .eq("user_id", userId)
    .eq("playlist_id", playlistId);
  if (error) throw error;
}

// Single-bookmark check. Used by AppPlaylistView to decide whether to
// render "Save" or "Saved ✓". `maybeSingle()` returns null (instead of
// erroring) when no row matches.
export async function isPlaylistSaved(
  userId: string,
  playlistId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("saved_playlists")
    .select("playlist_id")
    .eq("user_id", userId)
    .eq("playlist_id", playlistId)
    .maybeSingle();
  if (error) throw error;
  return data !== null;
}

// Everything user X has saved, newest-saved first. Pulls the playlist
// row inline via FK embed and exposes it as the same AppPlaylistSummary
// shape HomePage already renders for owned playlists.
//
// Note: `app_playlists!inner` makes Supabase do an inner join, so a
// playlist that's been hard-deleted (which CASCADE should handle anyway)
// won't surface as a ghost row.
export async function listSavedPlaylists(
  userId: string
): Promise<AppPlaylistSummary[]> {
  const { data, error } = await supabase
    .from("saved_playlists")
    .select(
      "saved_at, app_playlists!inner(id, owner_id, name, description, vinyl_color, is_public, created_at, updated_at, app_playlist_songs(count))"
    )
    .eq("user_id", userId)
    .order("saved_at", { ascending: false });
  if (error) throw error;

  const rows = (data ?? []) as unknown as SavedJoinRow[];
  return rows
    .map(joinRowToSummary)
    .filter((s): s is AppPlaylistSummary => s !== null);
}

// Re-export the row type for tests/devtools that want to inspect the
// raw shape. (We use `void` to silence "unused" if no one imports it.)
export type { SavedRow };
