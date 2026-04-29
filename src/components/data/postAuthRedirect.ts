// ---------------------------------------------------------------------------
// postAuthRedirect — bridge a "where to go after signup" intent across the
// auth round-trip.
// ---------------------------------------------------------------------------
// When an anonymous viewer hits a public share page (`/app-playlist/:id`)
// and clicks "Sign up", they leave the page to authenticate. After signup,
// they used to land on the LandingPage with no breadcrumb back — they had
// to re-open the original share link to get to the playlist again.
//
// To fix that, the share page stashes a small intent into sessionStorage
// before navigating to the auth flow. On first signed-in render, the
// LandingPage reads + clears it and routes the user back where they came
// from (optionally auto-saving the playlist on the way).
//
// sessionStorage (not localStorage) so the breadcrumb dies with the tab —
// no risk of a stale redirect haunting the user a week later.
// ---------------------------------------------------------------------------

const KEY = "spindeck_post_auth_redirect";

export interface PostAuthRedirect {
  // Path to send the user to after auth completes (e.g. "/app-playlist/abc").
  // Always an in-app path; we never round-trip an external URL through this.
  returnTo: string;
  // If true, treat the playlist referenced by returnTo as one the user
  // wants in their library and call savePlaylist on the way through.
  autoSave?: boolean;
}

export function setPostAuthRedirect(redirect: PostAuthRedirect): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(redirect));
  } catch {
    // sessionStorage can throw in private-mode Safari and similar. The
    // worst-case fallback is the user lands on Home after signup — same as
    // before this helper existed — so we swallow the error silently.
  }
}

export function consumePostAuthRedirect(): PostAuthRedirect | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    sessionStorage.removeItem(KEY);
    const parsed = JSON.parse(raw) as Partial<PostAuthRedirect>;
    if (!parsed || typeof parsed.returnTo !== "string") return null;
    // Only honor in-app paths. Anything that doesn't start with "/" gets
    // rejected so a stale or tampered value can't bounce us off-site.
    if (!parsed.returnTo.startsWith("/")) return null;
    return {
      returnTo: parsed.returnTo,
      autoSave: parsed.autoSave === true,
    };
  } catch {
    return null;
  }
}

// Best-effort regex pull of the playlist UUID out of a /app-playlist/:id
// path. Returns null for anything that doesn't match — callers should
// no-op on null rather than guess.
export function extractAppPlaylistId(returnTo: string): string | null {
  const m = returnTo.match(/^\/app-playlist\/([^/?#]+)/);
  return m ? m[1] : null;
}
