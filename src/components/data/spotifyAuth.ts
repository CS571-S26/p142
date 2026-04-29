const TOKEN_ENDPOINT = "https://accounts.spotify.com/api/token";
const AUTH_ENDPOINT = "https://accounts.spotify.com/authorize";
const SCOPES = [
  "playlist-read-private",
  "playlist-read-collaborative",
  "playlist-modify-private",
  "playlist-modify-public",
  "user-library-read",
  "user-read-private",
  "user-read-email",
  "streaming",
  "user-modify-playback-state",
].join(" ");

// --- localStorage keys ---
export const LS_ACCESS_TOKEN = "spotify_access_token";
export const LS_REFRESH_TOKEN = "spotify_refresh_token";
export const LS_TOKEN_EXPIRY = "spotify_token_expiry";
// Which SpinDeck user these tokens belong to. Used to prevent a Spotify
// connection from leaking across SpinDeck accounts on the same browser.
export const LS_OWNER_APP_USER_ID = "spindeck_spotify_owner_app_user_id";

// --- sessionStorage keys (only needed during the redirect round-trip) ---
const SS_CODE_VERIFIER = "spotify_code_verifier";
const SS_STATE = "spotify_auth_state";

// ---------------------------------------------------------------------------
// PKCE helpers
// ---------------------------------------------------------------------------

function randomString(length: number): string {
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const values = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(values, (v) => possible[v % possible.length]).join("");
}

async function sha256(plain: string): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  return crypto.subtle.digest("SHA-256", encoder.encode(plain));
}

function base64url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const hashed = await sha256(verifier);
  return base64url(hashed);
}

// ---------------------------------------------------------------------------
// Redirect to Spotify authorize
// ---------------------------------------------------------------------------

export async function redirectToSpotifyAuth(clientId: string, redirectUri: string) {
  const codeVerifier = randomString(64);
  const state = randomString(16);
  const codeChallenge = await generateCodeChallenge(codeVerifier);

  sessionStorage.setItem(SS_CODE_VERIFIER, codeVerifier);
  sessionStorage.setItem(SS_STATE, state);

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    scope: SCOPES,
    redirect_uri: redirectUri,
    state,
    code_challenge_method: "S256",
    code_challenge: codeChallenge,
    show_dialog: "true",
  });

  window.location.href = `${AUTH_ENDPOINT}?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// Exchange authorization code for tokens
// ---------------------------------------------------------------------------

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export async function exchangeCodeForTokens(
  clientId: string,
  code: string,
  redirectUri: string
): Promise<TokenResponse> {
  const codeVerifier = sessionStorage.getItem(SS_CODE_VERIFIER);
  const savedState = sessionStorage.getItem(SS_STATE);

  if (!codeVerifier) throw new Error("Missing PKCE code verifier — try logging in again.");

  // Clean up session storage now that we've read them
  sessionStorage.removeItem(SS_CODE_VERIFIER);
  sessionStorage.removeItem(SS_STATE);

  const urlState = new URLSearchParams(window.location.search).get("state");
  if (savedState && urlState !== savedState) {
    throw new Error("OAuth state mismatch — possible CSRF attack.");
  }

  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      code_verifier: codeVerifier,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Token exchange failed (${res.status}): ${body}`);
  }

  return res.json();
}

// ---------------------------------------------------------------------------
// Refresh an expired access token
// ---------------------------------------------------------------------------
// Two error modes matter to callers:
//
//   * AUTH errors (the refresh token is dead — Spotify says invalid_grant,
//     401, or the user revoked our app). The session is unrecoverable
//     and the user has to reconnect. Tokens should be cleared.
//
//   * TRANSIENT errors (network down, DNS failure, 5xx, timeout). The
//     refresh token is still good; the request just couldn't complete.
//     Callers should KEEP the cached tokens and try again later.
//
// We surface that distinction with `kind` on the thrown error so the
// SpotifyContext doesn't accidentally log users out on a flaky Wi-Fi
// blip after a laptop wakes from sleep.

export type RefreshErrorKind = "auth" | "transient";

export class RefreshError extends Error {
  kind: RefreshErrorKind;
  status: number | null;
  constructor(kind: RefreshErrorKind, message: string, status: number | null = null) {
    super(message);
    this.name = "RefreshError";
    this.kind = kind;
    this.status = status;
  }
}

export async function refreshAccessToken(
  clientId: string,
  refreshToken: string
): Promise<TokenResponse> {
  let res: Response;
  try {
    res = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: clientId,
      }),
    });
  } catch (e) {
    // Network-level failure (offline, DNS, CORS preflight blocked, etc.).
    // Always transient — the token itself is presumably still valid.
    throw new RefreshError(
      "transient",
      e instanceof Error ? `Network error during token refresh: ${e.message}` : "Network error during token refresh"
    );
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    // Spotify uses 400 invalid_grant when the refresh token is no longer
    // accepted (revoked, expired, rotated). 401 from the token endpoint
    // also means the credentials are bad. Anything else (429, 5xx, etc.)
    // we treat as transient.
    const isAuthError =
      res.status === 400 || res.status === 401 || /invalid_grant/i.test(body);
    throw new RefreshError(
      isAuthError ? "auth" : "transient",
      `Token refresh failed (${res.status}): ${body}`,
      res.status
    );
  }

  return res.json();
}

// ---------------------------------------------------------------------------
// localStorage token helpers
// ---------------------------------------------------------------------------

export function saveTokens(data: TokenResponse) {
  localStorage.setItem(LS_ACCESS_TOKEN, data.access_token);
  if (data.refresh_token) {
    localStorage.setItem(LS_REFRESH_TOKEN, data.refresh_token);
  }
  const expiresAt = Date.now() + data.expires_in * 1000;
  localStorage.setItem(LS_TOKEN_EXPIRY, expiresAt.toString());
  // Notify same-tab listeners (the SpotifyContext) that we have a fresh
  // access token. The native `storage` event only fires in OTHER tabs,
  // so without this, an in-tab refresh (e.g. from spotifyApi after a
  // 401) would update localStorage but leave the React state stale.
  emitTokenRefresh(data.access_token, expiresAt);
}

export function loadTokens() {
  return {
    accessToken: localStorage.getItem(LS_ACCESS_TOKEN),
    refreshToken: localStorage.getItem(LS_REFRESH_TOKEN),
    expiresAt: Number(localStorage.getItem(LS_TOKEN_EXPIRY) || "0"),
  };
}

export function clearTokens() {
  localStorage.removeItem(LS_ACCESS_TOKEN);
  localStorage.removeItem(LS_REFRESH_TOKEN);
  localStorage.removeItem(LS_TOKEN_EXPIRY);
  localStorage.removeItem(LS_OWNER_APP_USER_ID);
}

// Record which SpinDeck user just completed the OAuth flow. Called by
// SpotifyContext right after a successful code-for-tokens exchange.
// Token refreshes don't touch this — ownership is set once, at connect.
export function setOwnerAppUserId(appUserId: string) {
  localStorage.setItem(LS_OWNER_APP_USER_ID, appUserId);
}

export function getOwnerAppUserId(): string | null {
  return localStorage.getItem(LS_OWNER_APP_USER_ID);
}

export function getRedirectUri(): string {
  return window.location.origin + "/p142/";
}

// ---------------------------------------------------------------------------
// In-tab token-refresh bus
// ---------------------------------------------------------------------------
// Any module that successfully refreshes the access token (the scheduled
// timer in SpotifyContext, the 401-recovery path in spotifyApi, or a future
// caller) goes through saveTokens(), which emits one of these events. The
// SpotifyContext subscribes so its `token` state stays in sync without
// having to re-mount the provider.

export const SPOTIFY_TOKEN_REFRESH_EVENT = "spindeck:spotify-token-refresh";

export interface TokenRefreshDetail {
  accessToken: string;
  expiresAt: number;
}

function emitTokenRefresh(accessToken: string, expiresAt: number) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<TokenRefreshDetail>(SPOTIFY_TOKEN_REFRESH_EVENT, {
      detail: { accessToken, expiresAt },
    })
  );
}
