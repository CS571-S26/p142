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
        saveTokens(data);
        setToken(data.access_token);
        scheduleRefresh(Date.now() + data.expires_in * 1000);
      } catch {
        clearTokens();
        setToken("");
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
          const data = await refreshAccessToken(CLIENT_ID, refreshToken);
          saveTokens(data);
          setToken(data.access_token);
          scheduleRefresh(Date.now() + data.expires_in * 1000);
        }
      } catch {
        clearTokens();
        setToken("");
      } finally {
        setIsLoading(false);
      }
    })();
  }, [status, currentUserId, scheduleRefresh]);

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
