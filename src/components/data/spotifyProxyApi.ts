import type { Song } from "./mockData";
import { supabase } from "./supabaseClient";

// ---------------------------------------------------------------------------
// spotifyProxyApi — client side of the spotify-proxy Edge Function.
// ---------------------------------------------------------------------------
// Used for Public-Mode flows (and anywhere we just need track metadata
// without a personal Spotify token). The Edge Function holds the
// Client-Credentials app token server-side, so this file never touches any
// secrets.
//
// Returns the same `Song` shape that `spotifyApi.ts` does, so callers can
// drop one in place of the other.
// ---------------------------------------------------------------------------

interface SpotifyImage {
  url: string;
  height?: number | null;
  width?: number | null;
}

interface RawTrack {
  id: string;
  uri?: string;
  name: string;
  artists?: { name: string }[];
  album?: { name?: string; images?: SpotifyImage[] };
  duration_ms?: number;
}

function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function trackToSong(t: RawTrack): Song {
  return {
    id: t.id,
    title: t.name,
    artist: t.artists?.map((a) => a.name).join(", ") ?? "Unknown Artist",
    album: t.album?.name ?? "Unknown Album",
    albumArt: t.album?.images?.[0]?.url ?? "",
    noteCount: 0,
    favoriteCount: 0,
    duration: formatDuration(t.duration_ms ?? 0),
    durationMs: t.duration_ms,
    uri: t.uri ?? `spotify:track:${t.id}`,
  };
}

// ---------------------------------------------------------------------------
// Calls the Edge Function via the supabase-js client. That client takes care
// of attaching the user's JWT + anon key for us. We pass `action` in the body
// so the same function name covers multiple routes.
// ---------------------------------------------------------------------------
async function invokeProxy<T>(
  action: "search" | "tracks",
  params: Record<string, string | number>
): Promise<T> {
  const { data, error } = await supabase.functions.invoke("spotify-proxy", {
    body: { action, ...params },
  });
  if (error) {
    // supabase-js wraps non-2xx responses as FunctionsHttpError whose
    // `.message` is just "Edge Function returned a non-2xx status code".
    // The actual error body (our `{ error: "..." }`) hangs off
    // `error.context.response` — read it so the user sees the real cause.
    let serverMsg = "";
    const ctx = (error as { context?: { response?: Response } }).context;
    if (ctx?.response) {
      try {
        const body = await ctx.response.clone().json();
        if (body && typeof body === "object" && "error" in body) {
          serverMsg = String((body as { error: unknown }).error);
        }
      } catch {
        try {
          serverMsg = await ctx.response.clone().text();
        } catch {
          /* swallow */
        }
      }
    }
    const base = error.message ?? "spotify-proxy call failed";
    throw new Error(serverMsg ? `${base}: ${serverMsg}` : base);
  }
  if (data && typeof data === "object" && "error" in data && data.error) {
    throw new Error(String((data as { error: unknown }).error));
  }
  return data as T;
}

export async function searchTracksPublic(
  query: string,
  limit = 10
): Promise<Song[]> {
  const q = query.trim();
  if (!q) return [];
  const data = await invokeProxy<{ tracks: RawTrack[] }>("search", {
    q,
    limit,
  });
  return (data.tracks ?? []).filter((t) => t != null).map(trackToSong);
}

export async function fetchTracksPublic(ids: string[]): Promise<Song[]> {
  const clean = ids.filter((id) => typeof id === "string" && id.length > 0);
  if (clean.length === 0) return [];
  const data = await invokeProxy<{ tracks: RawTrack[] }>("tracks", {
    ids: clean.join(","),
  });
  // Preserve caller-supplied order. Spotify returns null in-place for
  // missing IDs; we drop them up in the Edge Function, so we reorder
  // here by matching on `id`.
  const byId = new Map<string, Song>();
  for (const t of data.tracks ?? []) {
    if (t?.id) byId.set(t.id, trackToSong(t));
  }
  return clean
    .map((id) => byId.get(id))
    .filter((s): s is Song => s != null);
}
