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

export async function refreshAccessToken(
  clientId: string,
  refreshToken: string
): Promise<TokenResponse> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Token refresh failed (${res.status}): ${body}`);
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
