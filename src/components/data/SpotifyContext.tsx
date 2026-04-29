import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import {
  redirectToSpotifyAuth,
  exchangeCodeForTokens,
  refreshAccessToken,
  saveTokens,
  loadTokens,
  clearTokens,
  getRedirectUri,
  setOwnerAppUserId,
  getOwnerAppUserId,
  RefreshError,
  SPOTIFY_TOKEN_REFRESH_EVENT,
  LS_ACCESS_TOKEN,
  type TokenRefreshDetail,
} from "./spotifyAuth";
import { useAppUser } from "./AppUserContext";

interface SpotifyContextType {
  token: string;
  isConnected: boolean;
  isLoading: boolean;
  login: () => Promise<void>;
  logout: () => void;
}

const SpotifyContext = createContext<SpotifyContextType | null>(null);

const CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID ?? "";
const REFRESH_BUFFER_MS = 5 * 60 * 1000; // refresh 5 min before expiry
// When a refresh fails for transient reasons (offline, 5xx, throttled),
// don't punt the user back to the connect button — try again shortly.
const TRANSIENT_RETRY_MS = 30 * 1000;

export function SpotifyProvider({ children }: { children: ReactNode }) {
  const { user, status } = useAppUser();
  const currentUserId = user?.id ?? null;
  const [token, setToken] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasBootstrappedRef = useRef(false);

  const scheduleRefresh = useCallback((expiresAt: number) => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);

    const msUntilRefresh = Math.max(expiresAt - Date.now() - REFRESH_BUFFER_MS, 0);

    refreshTimer.current = setTimeout(async () => {
      const { refreshToken } = loadTokens();
      if (!refreshToken) return;
      try {
        const data = await refreshAccessToken(CLIENT_ID, refreshToken);
        // saveTokens() emits SPOTIFY_TOKEN_REFRESH_EVENT, which our
        // listener below uses to update React state and reschedule.
        // No need to setToken / scheduleRefresh manually here.
        saveTokens(data);
      } catch (e) {
        // Only force a reconnect when the refresh token is permanently
        // dead. Transient failures (offline laptop, Spotify 5xx, network
        // throttling after sleep) used to log the user out — that's
        // exactly the "I have to reconnect every morning" bug. Now we
        // keep the cached tokens and try again in 30s; visibility-change
        // will also retry whenever the tab regains focus.
        if (e instanceof RefreshError && e.kind === "auth") {
          clearTokens();
          setToken("");
          return;
        }
        refreshTimer.current = setTimeout(() => {
          // Re-arm by recursing through the same path. We pass the same
          // expiresAt so the buffer math stays consistent with the
          // already-cached token.
          scheduleRefresh(expiresAt);
        }, TRANSIENT_RETRY_MS);
      }
    }, msUntilRefresh);
  }, []);

  useEffect(() => {
    // Wait for SpinDeck auth to finish bootstrapping. We need to know
    // who (if anyone) is signed in before we decide whether to use any
    // cached Spotify tokens, and — critically — before we stamp
    // ownership on freshly-exchanged tokens after an OAuth redirect.
    if (status === "loading") return;
    if (hasBootstrappedRef.current) return;
    hasBootstrappedRef.current = true;

    (async () => {
      try {
        // Returning from a Spotify OAuth redirect?
        const params = new URLSearchParams(window.location.search);
        const code = params.get("code");

        if (code) {
          // If somehow no one is signed into SpinDeck anymore (session
          // expired during the redirect trip), discard the code rather
          // than save unowned tokens.
          if (!currentUserId) {
            window.history.replaceState({}, "", window.location.pathname);
            return;
          }
          const data = await exchangeCodeForTokens(
            CLIENT_ID,
            code,
            getRedirectUri()
          );
          saveTokens(data);
          setOwnerAppUserId(currentUserId);
          setToken(data.access_token);
          scheduleRefresh(Date.now() + data.expires_in * 1000);
          window.history.replaceState({}, "", window.location.pathname + "#/home");
          return;
        }

        // No code in URL — check localStorage for an existing session.
        const { accessToken, refreshToken, expiresAt } = loadTokens();

        // If there's no SpinDeck user, don't attach any tokens to this
        // session. They'll either match and get loaded when the user
        // signs in, or get cleared by the ownership guard.
        if (!currentUserId) return;

        // Any cached tokens must have a recorded owner that matches the
        // current SpinDeck user. Unowned tokens (from before we started
        // tracking ownership) are dropped too — the user reconnects
        // once and future loads are clean.
        const owner = getOwnerAppUserId();
        if (!owner || owner !== currentUserId) {
          clearTokens();
          return;
        }

        if (accessToken && expiresAt > Date.now()) {
          setToken(accessToken);
          scheduleRefresh(expiresAt);
        } else if (refreshToken) {
          try {
            const data = await refreshAccessToken(CLIENT_ID, refreshToken);
            saveTokens(data);
            // saveTokens broadcasts; the listener will set state and
            // schedule the next refresh.
          } catch (e) {
            if (e instanceof RefreshError && e.kind === "auth") {
              clearTokens();
              setToken("");
            } else {
              // Transient failure during bootstrap — keep the refresh
              // token, present as disconnected for now, and let
              // visibility-change retry once the tab regains focus
              // (typically right after a laptop wakes up). The user
              // should not have to click "Connect to Spotify" again.
              setToken("");
            }
          }
        }
      } catch (e) {
        // Errors NOT from refreshAccessToken (e.g. exchangeCodeForTokens
        // after a redirect) still warrant clearing — those mean the
        // OAuth flow itself broke.
        if (e instanceof RefreshError && e.kind !== "auth") {
          // shouldn't normally land here, but be defensive
          setToken("");
        } else {
          clearTokens();
          setToken("");
        }
      } finally {
        setIsLoading(false);
      }
    })();
  }, [status, currentUserId, scheduleRefresh]);

  // ---- Same-tab and cross-tab sync ---------------------------------------
  // saveTokens() dispatches SPOTIFY_TOKEN_REFRESH_EVENT after every
  // successful refresh — whether that was the scheduled timer here, the
  // 401-recovery path in spotifyApi, or a future caller. We listen so
  // React state stays consistent with localStorage.
  useEffect(() => {
    function onRefresh(e: Event) {
      const detail = (e as CustomEvent<TokenRefreshDetail>).detail;
      if (!detail?.accessToken) return;
      setToken(detail.accessToken);
      scheduleRefresh(detail.expiresAt);
    }
    window.addEventListener(SPOTIFY_TOKEN_REFRESH_EVENT, onRefresh);
    return () => {
      window.removeEventListener(SPOTIFY_TOKEN_REFRESH_EVENT, onRefresh);
    };
  }, [scheduleRefresh]);

  // Cross-tab: another tab refreshed the token (or signed out). Mirror
  // the change here so the user doesn't see a stale "Connect to Spotify"
  // button in this tab.
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== LS_ACCESS_TOKEN) return;
      const { accessToken, expiresAt } = loadTokens();
      if (accessToken && expiresAt > Date.now()) {
        setToken(accessToken);
        scheduleRefresh(expiresAt);
      } else {
        setToken("");
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [scheduleRefresh]);

  // ---- Visibility / online recovery --------------------------------------
  // Browsers throttle (or outright suspend) inactive tabs and discard
  // background tabs to save memory. Our refresh setTimeout can fire
  // late, fire instantly without network, or not fire at all after a
  // laptop wakes from sleep. Whenever the tab regains focus or the
  // browser comes back online, re-check the token and refresh if it's
  // expired or close to expiring. This is the actual fix for the
  // "I came back to my laptop and Spotify is disconnected again" UX.
  useEffect(() => {
    if (!currentUserId) return;

    async function maybeRefresh() {
      const { accessToken, refreshToken: rt, expiresAt } = loadTokens();
      // No refresh token means the user has never connected (or signed
      // out). Nothing to do.
      if (!rt) return;
      // Owner check — defensive duplicate of the bootstrap guard.
      const owner = getOwnerAppUserId();
      if (owner && owner !== currentUserId) return;

      const needsRefresh =
        !accessToken || expiresAt <= Date.now() + REFRESH_BUFFER_MS;
      if (!needsRefresh) {
        // Token still valid; just make sure React state matches.
        if (accessToken && !token) {
          setToken(accessToken);
          scheduleRefresh(expiresAt);
        }
        return;
      }

      try {
        const data = await refreshAccessToken(CLIENT_ID, rt);
        saveTokens(data); // emits the event; listener updates state.
      } catch (e) {
        if (e instanceof RefreshError && e.kind === "auth") {
          clearTokens();
          setToken("");
        }
        // Transient: leave tokens alone; we'll try again on next focus.
      }
    }

    function onVisible() {
      if (document.visibilityState === "visible") void maybeRefresh();
    }
    function onOnline() {
      void maybeRefresh();
    }

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    window.addEventListener("online", onOnline);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.removeEventListener("online", onOnline);
    };
  }, [currentUserId, token, scheduleRefresh]);

  // Clear the refresh timer only on unmount — not on every auth-state
  // change. (If this cleanup lived on the bootstrap effect, changing
  // `status` after bootstrap would tear down the timer.)
  useEffect(() => {
    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
  }, []);

  // Ownership guard. Whenever the SpinDeck auth state settles, verify
  // that any cached Spotify tokens belong to the currently-signed-in
  // user. If a different user signs in (or the browser has orphaned
  // tokens from a previous user), drop them so accounts don't share
  // Spotify access.
  //
  // We intentionally do NOT clear when the current user is null (signed
  // out) — that way the same user signing back in finds their Spotify
  // still connected. Only a mismatch between a real owner and a real
  // different current user triggers a clear.
  useEffect(() => {
    if (status === "loading" || status === "error") return;
    const owner = getOwnerAppUserId();
    if (owner && currentUserId && owner !== currentUserId) {
      clearTokens();
      setToken("");
      if (refreshTimer.current) {
        clearTimeout(refreshTimer.current);
        refreshTimer.current = null;
      }
    }
  }, [currentUserId, status]);

  const login = useCallback(async () => {
    await redirectToSpotifyAuth(CLIENT_ID, getRedirectUri());
  }, []);

  const logout = useCallback(() => {
    clearTokens();
    setToken("");
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
  }, []);

  return (
    <SpotifyContext.Provider
      value={{
        token,
        isConnected: !!token,
        isLoading,
        login,
        logout,
      }}
    >
      {children}
    </SpotifyContext.Provider>
  );
}

export function useSpotify() {
  const ctx = useContext(SpotifyContext);
  if (!ctx) throw new Error("useSpotify must be used within SpotifyProvider");
  return ctx;
}
