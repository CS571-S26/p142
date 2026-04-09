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
  name: string;
  artists: { name: string }[];
  album: { name: string; images: SpotifyImage[] };
  duration_ms: number;
}

interface SpotifyTrackItem {
  track?: SpotifyTrackData | null;
  item?: SpotifyTrackData | null;
}

async function spotifyFetchRaw<T>(url: string, token: string): Promise<T> {
  let res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 401) {
    const { refreshToken } = loadTokens();
    if (refreshToken) {
      try {
        const data = await refreshAccessToken(CLIENT_ID, refreshToken);
        saveTokens(data);
        res = await fetch(url, {
          headers: { Authorization: `Bearer ${data.access_token}` },
        });
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
  return res.json();
}

async function spotifyFetch<T>(endpoint: string, token: string): Promise<T> {
  return spotifyFetchRaw<T>(`${BASE}${endpoint}`, token);
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
}

interface SpotifyPaginatedTracks {
  items: SpotifyTrackItem[];
  next: string | null;
  total: number;
}

function parseTrackEntries(rawItems: SpotifyTrackItem[]): Song[] {
  return rawItems
    .filter((entry) => (entry?.track ?? entry?.item) != null)
    .map((entry) => {
      const t = (entry.track ?? entry.item)!;
      return {
        id: t.id,
        title: t.name,
        artist: t.artists?.map((a) => a.name).join(", ") ?? "Unknown Artist",
        album: t.album?.name ?? "Unknown Album",
        albumArt: t.album?.images?.[0]?.url ?? "",
        noteCount: 0,
        favoriteCount: 0,
        duration: formatDuration(t.duration_ms ?? 0),
      };
    });
}

export async function fetchPlaylistDetail(
  token: string,
  playlistId: string
): Promise<PlaylistDetail> {
  const data = await spotifyFetch<{
    name: string;
    description: string;
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
  };
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
