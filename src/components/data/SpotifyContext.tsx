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
} from "./spotifyAuth";

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
  const [token, setToken] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    (async () => {
      try {
        // Check if we're returning from a Spotify redirect with an auth code
        const params = new URLSearchParams(window.location.search);
        const code = params.get("code");

        if (code) {
          const data = await exchangeCodeForTokens(
            CLIENT_ID,
            code,
            getRedirectUri()
          );
          saveTokens(data);
          setToken(data.access_token);
          scheduleRefresh(Date.now() + data.expires_in * 1000);

          // Clean the URL so the code isn't reused on refresh
          window.history.replaceState({}, "", window.location.pathname + "#/home");
          return;
        }

        // No code in URL — check localStorage for an existing session
        const { accessToken, refreshToken, expiresAt } = loadTokens();

        if (accessToken && expiresAt > Date.now()) {
          setToken(accessToken);
          scheduleRefresh(expiresAt);
        } else if (refreshToken) {
          // Token expired but we have a refresh token
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

    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
  }, [scheduleRefresh]);

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
