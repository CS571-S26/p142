import { supabase } from "./supabaseClient";

// ---------------------------------------------------------------------------
// favoritePartsApi — personal favorite-part CRUD on `song_favorite_parts`.
// ---------------------------------------------------------------------------
// One row per (user_id, spotify_track_id). This is the *personal* side of
// the feature and pairs with the user's personal note in SongView. The
// playlist-owner-set favorite parts (used by AppSongView /
// AppPlaylistView) live as columns on `app_playlist_songs` and go
// through `appPlaylistsApi.updateAppPlaylistFavoritePart` instead.
//
// All writes are gated by RLS (user_id = auth.uid()); we still pass the
// userId here for symmetry with the rest of the data layer.
// ---------------------------------------------------------------------------

export interface FavoritePart {
  startMs: number;
  endMs: number;
  /** ISO timestamp of the last save. Useful for cache invalidation but
   * the UI rarely needs it. */
  updatedAt?: string;
}

interface FavoritePartRow {
  user_id: string;
  spotify_track_id: string;
  start_ms: number;
  end_ms: number;
  updated_at: string;
}

function rowToFavoritePart(row: FavoritePartRow): FavoritePart {
  return {
    startMs: row.start_ms,
    endMs: row.end_ms,
    updatedAt: row.updated_at,
  };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function fetchMyFavoritePart(
  userId: string,
  trackId: string
): Promise<FavoritePart | null> {
  const { data, error } = await supabase
    .from("song_favorite_parts")
    .select("user_id, spotify_track_id, start_ms, end_ms, updated_at")
    .eq("user_id", userId)
    .eq("spotify_track_id", trackId)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToFavoritePart(data as FavoritePartRow) : null;
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

// Upsert. Validates start < end and non-negative client-side so we can
// surface a friendly error before round-tripping; the DB CHECK
// constraints would also catch this but with a less readable message.
export async function setMyFavoritePart(input: {
  userId: string;
  trackId: string;
  startMs: number;
  endMs: number;
}): Promise<FavoritePart> {
  const start = Math.max(0, Math.round(input.startMs));
  const end = Math.round(input.endMs);
  if (end <= start) {
    throw new Error("Favorite part end must come after start.");
  }

  const { data, error } = await supabase
    .from("song_favorite_parts")
    .upsert(
      {
        user_id: input.userId,
        spotify_track_id: input.trackId,
        start_ms: start,
        end_ms: end,
      },
      { onConflict: "user_id,spotify_track_id" }
    )
    .select("user_id, spotify_track_id, start_ms, end_ms, updated_at")
    .single();

  if (error) throw error;
  return rowToFavoritePart(data as FavoritePartRow);
}

export async function clearMyFavoritePart(
  userId: string,
  trackId: string
): Promise<void> {
  const { error } = await supabase
    .from("song_favorite_parts")
    .delete()
    .eq("user_id", userId)
    .eq("spotify_track_id", trackId);
  if (error) throw error;
}
