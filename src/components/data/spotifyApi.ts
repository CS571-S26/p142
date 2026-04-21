import type { Playlist, Song } from "./mockData";
import {
  refreshAccessToken,
  loadTokens,
  saveTokens,
  clearTokens,
} from "./spotifyAuth";

const BASE = "https://api.spotify.com/v1";
const CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID ?? "";

const VINYL_COLORS = [
  "#1a1a2e", "#16213e", "#0f3460", "#e94560",
  "#533483", "#2b2d42", "#8d99ae", "#d90429",
  "#006d77", "#e29578", "#264653", "#2a9d8f",
];

function pickColor(index: number): string {
  return VINYL_COLORS[index % VINYL_COLORS.length];
}

function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

interface SpotifyImage {
  url: string;
  height: number | null;
  width: number | null;
}

interface SpotifyPlaylistItem {
  id: string;
  name: string;
  description: string;
  images: SpotifyImage[];
  tracks?: { total: number };
  items?: { total: number };
}

interface SpotifyTrackData {
  id: string;
  uri?: string;
  name: string;
  artists: { name: string }[];
  album: { name: string; images: SpotifyImage[] };
  duration_ms: number;
}

interface SpotifyTrackItem {
  track?: SpotifyTrackData | null;
  item?: SpotifyTrackData | null;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
}

function buildInit(token: string, options: RequestOptions = {}): RequestInit {
  const init: RequestInit = {
    method: options.method ?? "GET",
    headers: { Authorization: `Bearer ${token}` },
  };
  if (options.body !== undefined) {
    (init.headers as Record<string, string>)["Content-Type"] = "application/json";
    init.body = JSON.stringify(options.body);
  }
  return init;
}

async function spotifyFetchRaw<T>(
  url: string,
  token: string,
  options: RequestOptions = {}
): Promise<T> {
  let res = await fetch(url, buildInit(token, options));

  if (res.status === 401) {
    const { refreshToken } = loadTokens();
    if (refreshToken) {
      try {
        const data = await refreshAccessToken(CLIENT_ID, refreshToken);
        saveTokens(data);
        res = await fetch(url, buildInit(data.access_token, options));
      } catch {
        clearTokens();
        throw new Error("Session expired — please log in again.");
      }
    }
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Spotify API ${res.status}: ${body}`);
  }
  // Spotify returns 200/201 with JSON, or 204 No Content for some endpoints
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

async function spotifyFetch<T>(
  endpoint: string,
  token: string,
  options: RequestOptions = {}
): Promise<T> {
  return spotifyFetchRaw<T>(`${BASE}${endpoint}`, token, options);
}

export async function fetchUserPlaylists(token: string): Promise<Playlist[]> {
  const data = await spotifyFetch<{ items: SpotifyPlaylistItem[] }>(
    "/me/playlists?limit=20",
    token
  );

  return data.items
    .filter((p) => p != null)
    .map((p, i) => ({
      id: p.id,
      name: p.name,
      description: p.description || "No description",
      vinylColor: pickColor(i),
      songCount: p.items?.total ?? p.tracks?.total ?? 0,
      songs: [],
    }));
}

export async function fetchTrack(
  token: string,
  trackId: string
): Promise<Song> {
  const t = await spotifyFetch<{
    id: string;
    name: string;
    artists: { name: string }[];
    album: { name: string; images: SpotifyImage[] };
    duration_ms: number;
  }>(`/tracks/${trackId}`, token);

  return {
    id: t.id,
    title: t.name,
    artist: t.artists.map((a) => a.name).join(", "),
    album: t.album.name,
    albumArt: t.album.images[0]?.url ?? "",
    noteCount: 0,
    favoriteCount: 0,
    duration: formatDuration(t.duration_ms),
  };
}

export interface PlaylistDetail {
  name: string;
  description: string;
  songCount: number;
  songs: Song[];
  ownerId: string;
  ownerName: string;
  collaborative: boolean;
}

interface SpotifyPaginatedTracks {
  items: SpotifyTrackItem[];
  next: string | null;
  total: number;
}

function trackToSong(t: SpotifyTrackData): Song {
  return {
    id: t.id,
    title: t.name,
    artist: t.artists?.map((a) => a.name).join(", ") ?? "Unknown Artist",
    album: t.album?.name ?? "Unknown Album",
    albumArt: t.album?.images?.[0]?.url ?? "",
    noteCount: 0,
    favoriteCount: 0,
    duration: formatDuration(t.duration_ms ?? 0),
    uri: t.uri ?? `spotify:track:${t.id}`,
  };
}

function parseTrackEntries(rawItems: SpotifyTrackItem[]): Song[] {
  return rawItems
    .filter((entry) => (entry?.track ?? entry?.item) != null)
    .map((entry) => trackToSong((entry.track ?? entry.item)!));
}

export async function fetchPlaylistDetail(
  token: string,
  playlistId: string
): Promise<PlaylistDetail> {
  const data = await spotifyFetch<{
    name: string;
    description: string;
    owner?: { id: string; display_name?: string };
    collaborative?: boolean;
    tracks?: SpotifyPaginatedTracks;
    items?: SpotifyPaginatedTracks;
  }>(`/playlists/${playlistId}`, token);

  const firstPage = data.tracks ?? data.items;
  const allItems: SpotifyTrackItem[] = [...(firstPage?.items ?? [])];
  const total = firstPage?.total ?? 0;

  let nextUrl = firstPage?.next ?? null;
  while (nextUrl) {
    const page = await spotifyFetchRaw<SpotifyPaginatedTracks>(nextUrl, token);
    allItems.push(...(page.items ?? []));
    nextUrl = page.next;
  }

  return {
    name: data.name,
    description: data.description || "",
    songCount: total,
    songs: parseTrackEntries(allItems),
    ownerId: data.owner?.id ?? "",
    ownerName: data.owner?.display_name ?? "",
    collaborative: data.collaborative ?? false,
  };
}

// ---------------------------------------------------------------------------
// Current user (for playlist-ownership checks)
// ---------------------------------------------------------------------------

export interface CurrentUser {
  id: string;
  displayName: string;
}

export async function fetchCurrentUser(token: string): Promise<CurrentUser> {
  const data = await spotifyFetch<{ id: string; display_name?: string }>(
    "/me",
    token
  );
  return { id: data.id, displayName: data.display_name ?? "" };
}

// ---------------------------------------------------------------------------
// Track search (for adding songs to a playlist)
// ---------------------------------------------------------------------------

export async function searchTracks(
  token: string,
  query: string,
  limit = 10
): Promise<Song[]> {
  const q = query.trim();
  if (!q) return [];
  const params = new URLSearchParams({
    q,
    type: "track",
    limit: String(limit),
  });
  const data = await spotifyFetch<{
    tracks?: { items: SpotifyTrackData[] };
  }>(`/search?${params.toString()}`, token);
  return (data.tracks?.items ?? []).filter((t) => t != null).map(trackToSong);
}

// ---------------------------------------------------------------------------
// Playlist editing — add / remove tracks
// ---------------------------------------------------------------------------

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function addTracksToPlaylist(
  token: string,
  playlistId: string,
  uris: string[]
): Promise<void> {
  if (uris.length === 0) return;
  // Spotify accepts up to 100 URIs per request
  for (const batch of chunk(uris, 100)) {
    await spotifyFetch<{ snapshot_id: string }>(
      `/playlists/${playlistId}/tracks`,
      token,
      { method: "POST", body: { uris: batch } }
    );
  }
}

export async function removeTracksFromPlaylist(
  token: string,
  playlistId: string,
  uris: string[]
): Promise<void> {
  if (uris.length === 0) return;
  for (const batch of chunk(uris, 100)) {
    await spotifyFetch<{ snapshot_id: string }>(
      `/playlists/${playlistId}/tracks`,
      token,
      {
        method: "DELETE",
        body: { tracks: batch.map((uri) => ({ uri })) },
      }
    );
  }
}

export async function startPlayback(
  token: string,
  deviceId: string,
  options: { uris?: string[]; contextUri?: string; offsetIndex?: number } = {}
): Promise<void> {
  const body: Record<string, unknown> = {};
  if (options.contextUri) {
    body.context_uri = options.contextUri;
    if (options.offsetIndex != null) {
      body.offset = { position: options.offsetIndex };
    }
  } else if (options.uris) {
    body.uris = options.uris;
  }

  const res = await fetch(
    `${BASE}/me/player/play?device_id=${encodeURIComponent(deviceId)}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );

  if (res.status === 401) {
    const { refreshToken } = loadTokens();
    if (refreshToken) {
      const data = await refreshAccessToken(CLIENT_ID, refreshToken);
      saveTokens(data);
      const retry = await fetch(
        `${BASE}/me/player/play?device_id=${encodeURIComponent(deviceId)}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${data.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        }
      );
      if (!retry.ok && retry.status !== 204) {
        throw new Error(`Playback failed: ${retry.status}`);
      }
      return;
    }
  }

  if (!res.ok && res.status !== 204) {
    throw new Error(`Playback failed: ${res.status}`);
  }
}
