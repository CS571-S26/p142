import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { useSpotify } from "./SpotifyContext";
import { startPlayback, setShuffle as setShuffleApi } from "./spotifyApi";

interface CurrentTrack {
  id: string;
  name: string;
  artist: string;
  albumArt: string;
}

interface PlayerContextType {
  isReady: boolean;
  isPlaying: boolean;
  currentTrack: CurrentTrack | null;
  position: number;
  duration: number;
  isShuffled: boolean;
  play: (options: {
    uris?: string[];
    contextUri?: string;
    offsetIndex?: number;
  }) => Promise<void>;
  togglePlayPause: () => void;
  skipNext: () => void;
  skipPrev: () => void;
  seek: (ms: number) => void;
  toggleShuffle: () => Promise<void>;
}

const PlayerContext = createContext<PlayerContextType | null>(null);

export function PlayerProvider({ children }: { children: ReactNode }) {
  const { token, isConnected } = useSpotify();
  const playerRef = useRef<Spotify.Player | null>(null);
  const [deviceId, setDeviceId] = useState("");
  const [isReady, setIsReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTrack, setCurrentTrack] = useState<CurrentTrack | null>(null);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  // Shuffle is a player-level state on Spotify's side: changing it on
  // any client (web, mobile, desktop) is reflected here via
  // player_state_changed. We mirror it locally so the toggle button can
  // show the right state without a poll. toggleShuffle updates
  // optimistically, then the next state-change event confirms it.
  const [isShuffled, setIsShuffled] = useState(false);
  const positionTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!isConnected || !token) return;

    let cancelled = false;

    function init() {
      if (cancelled) return;

      const player = new Spotify.Player({
        name: "SpinDeck",
        getOAuthToken: (cb) => cb(token),
        volume: 0.5,
      });

      player.addListener("ready", ({ device_id }) => {
        if (cancelled) return;
        setDeviceId(device_id);
        setIsReady(true);
      });

      player.addListener("not_ready", () => {
        if (cancelled) return;
        setIsReady(false);
      });

      player.addListener("player_state_changed", (state) => {
        if (cancelled || !state) return;

        setIsPlaying(!state.paused);
        setPosition(state.position);
        setDuration(state.duration);
        setIsShuffled(!!state.shuffle);

        const track = state.track_window.current_track;
        setCurrentTrack({
          id: track.id,
          name: track.name,
          artist: track.artists.map((a) => a.name).join(", "),
          albumArt: track.album.images[0]?.url ?? "",
        });
      });

      player.addListener("initialization_error", (e) =>
        console.error("Spotify SDK init error:", e.message)
      );
      player.addListener("authentication_error", (e) =>
        console.error("Spotify SDK auth error:", e.message)
      );
      player.addListener("account_error", (e) =>
        console.error("Spotify SDK account error:", e.message)
      );

      player.connect();
      playerRef.current = player;
    }

    if (window.Spotify) {
      init();
    } else {
      window.onSpotifyWebPlaybackSDKReady = init;
    }

    return () => {
      cancelled = true;
      playerRef.current?.disconnect();
      playerRef.current = null;
      setIsReady(false);
      setDeviceId("");
    };
  }, [isConnected, token]);

  // Tick position forward while playing
  useEffect(() => {
    if (positionTimer.current) clearInterval(positionTimer.current);

    if (isPlaying) {
      positionTimer.current = setInterval(() => {
        setPosition((p) => Math.min(p + 500, duration));
      }, 500);
    }

    return () => {
      if (positionTimer.current) clearInterval(positionTimer.current);
    };
  }, [isPlaying, duration]);

  const play = useCallback(
    async (options: {
      uris?: string[];
      contextUri?: string;
      offsetIndex?: number;
    }) => {
      if (!deviceId || !token) return;
      await startPlayback(token, deviceId, options);
    },
    [deviceId, token]
  );

  const togglePlayPause = useCallback(() => {
    playerRef.current?.togglePlay();
  }, []);

  const skipNext = useCallback(() => {
    playerRef.current?.nextTrack();
  }, []);

  const skipPrev = useCallback(() => {
    playerRef.current?.previousTrack();
  }, []);

  const seek = useCallback((ms: number) => {
    playerRef.current?.seek(ms);
    setPosition(ms);
  }, []);

  // Optimistic flip + REST call. The Web Playback SDK doesn't expose a
  // setShuffle method, so we go through Spotify's REST API; the next
  // player_state_changed event will reconcile state if the call failed.
  const toggleShuffle = useCallback(async () => {
    if (!deviceId || !token) return;
    const next = !isShuffled;
    setIsShuffled(next);
    try {
      await setShuffleApi(token, deviceId, next);
    } catch {
      // Roll back on failure — the user sees the toggle snap back so
      // they know the change didn't take.
      setIsShuffled(!next);
    }
  }, [deviceId, token, isShuffled]);

  return (
    <PlayerContext.Provider
      value={{
        isReady,
        isPlaying,
        currentTrack,
        position,
        duration,
        isShuffled,
        play,
        togglePlayPause,
        skipNext,
        skipPrev,
        seek,
        toggleShuffle,
      }}
    >
      {children}
    </PlayerContext.Provider>
  );
}

export function usePlayer() {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error("usePlayer must be used within PlayerProvider");
  return ctx;
}
