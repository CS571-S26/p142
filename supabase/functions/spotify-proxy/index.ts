// =============================================================================
// spotify-proxy — Supabase Edge Function (Deno)
// =============================================================================
// Public-Mode users don't log into Spotify, but SpinDeck still needs to show
// track titles, artists, album art, and let them search for songs to add to
// annotated playlists. We solve that with Spotify's Client Credentials flow:
// the Edge Function exchanges SPOTIFY_CLIENT_ID + SPOTIFY_CLIENT_SECRET for an
// app-level access token, caches it in worker scope, and proxies two
// read-only endpoints.
//
// Routes (all GET, JSON responses):
//   /search?q=<query>&limit=<1-50>    — track search
//   /tracks?ids=<id1,id2,...>         — up to 50 track IDs
//
// The client invokes this via `supabase.functions.invoke("spotify-proxy", ...)`
// which sends the user's Supabase JWT automatically; the function trusts that
// the invocation came from a logged-in SpinDeck user.
//
// Secrets required (set via `supabase secrets set ...`):
//   SPOTIFY_CLIENT_ID
//   SPOTIFY_CLIENT_SECRET
// =============================================================================

// Supabase Edge Functions run on Deno. We use the built-in `Deno.serve`
// instead of importing `serve` from deno.land/std — the hosted runtime
// already provides it, and avoiding a cold-start `deno.land` fetch removes
// a failure mode that otherwise looked like a silent 500.
// deno-lint-ignore-file no-explicit-any
// @ts-ignore - Deno global is injected by the Edge Functions runtime
declare const Deno: {
  env: { get(key: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};

const TOKEN_ENDPOINT = "https://accounts.spotify.com/api/token";
const SPOTIFY_API = "https://api.spotify.com/v1";

// --- CORS ------------------------------------------------------------------
// `supabase.functions.invoke` always sends an Authorization header; the
// preflight OPTIONS probe from the browser needs that header allowed
// explicitly, otherwise it'll block the real POST.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS,
      ...(init.headers ?? {}),
    },
  });
}

// --- Token cache -----------------------------------------------------------
// Client Credentials tokens are app-level (no user), so we can safely keep
// one in worker scope and reuse it across requests until it's about to
// expire. Refresh 60s early to avoid racing.
interface CachedToken {
  accessToken: string;
  expiresAt: number; // epoch ms
}
let cachedToken: CachedToken | null = null;

async function getAppToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt - 60_000 > now) {
    return cachedToken.accessToken;
  }

  const clientId = Deno.env.get("SPOTIFY_CLIENT_ID");
  const clientSecret = Deno.env.get("SPOTIFY_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    // Distinguish "not set" from "empty string" for clearer log output.
    const missing = [
      !clientId ? "SPOTIFY_CLIENT_ID" : null,
      !clientSecret ? "SPOTIFY_CLIENT_SECRET" : null,
    ]
      .filter(Boolean)
      .join(", ");
    throw new Error(`spotify-proxy is missing secrets: ${missing}`);
  }

  const basic = btoa(`${clientId}:${clientSecret}`);
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Client Credentials exchange failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return cachedToken.accessToken;
}

// --- Spotify call with one retry on 401 ------------------------------------
async function spotifyGet(path: string): Promise<any> {
  let token = await getAppToken();
  let res = await fetch(`${SPOTIFY_API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 401) {
    // Cached token rejected — wipe cache, refresh, retry once.
    cachedToken = null;
    token = await getAppToken();
    res = await fetch(`${SPOTIFY_API}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Spotify ${path} → ${res.status}: ${body}`);
  }
  return await res.json();
}

// --- Route handlers --------------------------------------------------------

async function handleSearch(params: URLSearchParams): Promise<Response> {
  const q = params.get("q")?.trim() ?? "";
  const limitRaw = Number(params.get("limit") ?? "10");
  const limit = Number.isFinite(limitRaw)
    ? Math.min(Math.max(Math.floor(limitRaw), 1), 50)
    : 10;

  if (!q) return json({ tracks: [] });

  const query = new URLSearchParams({ q, type: "track", limit: String(limit) });
  const data = await spotifyGet(`/search?${query.toString()}`);
  return json({ tracks: data.tracks?.items ?? [] });
}

async function handleTracks(params: URLSearchParams): Promise<Response> {
  const idsRaw = params.get("ids")?.trim() ?? "";
  if (!idsRaw) return json({ tracks: [] });

  // Spotify /tracks caps at 50 ids/call. Chunk if the client ever passes more.
  const ids = idsRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 200); // hard cap to keep worker bounded

  const out: any[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const data = await spotifyGet(
      `/tracks?ids=${encodeURIComponent(chunk.join(","))}`
    );
    for (const t of data.tracks ?? []) {
      if (t) out.push(t);
    }
  }
  return json({ tracks: out });
}

// --- Router ----------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  try {
    const url = new URL(req.url);
    // Edge Functions serve at /functions/v1/spotify-proxy/<rest>. Pull the
    // trailing segment so we can dispatch on it, and tolerate the bare
    // /functions/v1/spotify-proxy case (treat as /search requires a query).
    const segments = url.pathname.split("/").filter(Boolean);
    // last segment that isn't "spotify-proxy" itself — or empty if they hit
    // the root.
    const route = segments[segments.length - 1] ?? "";

    // Params can come from the query string (GET) or a JSON body (POST
    // invocation via supabase.functions.invoke).
    let params = url.searchParams;
    if (req.method === "POST") {
      try {
        const body = await req.json();
        const merged = new URLSearchParams();
        // Carry query string through.
        url.searchParams.forEach((v, k) => merged.set(k, v));
        // Body overrides.
        for (const [k, v] of Object.entries(body ?? {})) {
          if (v == null) continue;
          merged.set(k, String(v));
        }
        params = merged;
      } catch {
        // No/invalid JSON body is fine — fall back to the query string.
      }
    }

    if (route === "search") return await handleSearch(params);
    if (route === "tracks") return await handleTracks(params);
    // supabase.functions.invoke("spotify-proxy", { body: { action, ... } })
    // lets callers pass the "route" in the body rather than as a path, which
    // plays nicer with the supabase-js client.
    const action = params.get("action");
    if (action === "search") return await handleSearch(params);
    if (action === "tracks") return await handleTracks(params);

    console.log("[spotify-proxy] unrouted request", {
      method: req.method,
      pathname: url.pathname,
      route,
      keys: Array.from(params.keys()),
    });
    return json(
      {
        error:
          "Unknown route. Invoke with `body: { action: 'search' | 'tracks', ... }` or GET /search|/tracks.",
      },
      { status: 404 }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const stack = e instanceof Error ? e.stack : undefined;
    // Log the full stack server-side so the Supabase logs tell us exactly
    // where it blew up. The client gets the message text.
    console.error("[spotify-proxy]", message, stack);
    return json({ error: message }, { status: 500 });
  }
});
