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

// Identifies which playlist (if any) is the source of the audio
// currently playing. Set when a page calls `play()` with a `playlistId`
// option. Used by HomePage and the playlist views so they can spin the
// vinyl that represents the active playlist. Null until the user has
// played anything in the session.
export interface PlayingPlaylist {
  /** "spotify" for tracks served via spotify:playlist:{id} contextUri,
   * "app" for tracks queued from a SpinDeck-native annotated playlist. */
  kind: "spotify" | "app";
  id: string;
}

// A favorite-part "highlight" attached to whatever's currently playing.
// PlayerContext doesn't fetch this itself — it's a pull-up state that
// pages set. The model: SongView / AppSongView / AppPlaylistView know
// which favorite-part data applies to the track they're showing, and
// when that track is also the one playing, they push it here so
// NowPlayingBar can render the band globally. Auto-clears when the
// currently-playing track id changes (so a stale page-set part never
// leaks onto the next song).
export interface FavoritePartHighlight {
  startMs: number;
  endMs: number;
  /** The track id this highlight belongs to. We compare against
   * currentTrack.id to decide if it's still relevant. */
  trackId: string;
}

interface PlayerContextType {
  isReady: boolean;
  isPlaying: boolean;
  currentTrack: CurrentTrack | null;
  position: number;
  duration: number;
  isShuffled: boolean;
  /** Favorite-part band/chip data for the currently-playing track, if a
   * page has pushed one in. Cleared automatically when the track id
   * changes; the page that set it remains the source of truth. */
  currentFavoritePart: FavoritePartHighlight | null;
  /** The playlist sourcing the current audio. Set when `play()` is
   * called with a `playlistId`. Persists across pause/skip — pages
   * combine it with `isPlaying` to decide whether to spin a vinyl. */
  currentPlaylistId: PlayingPlaylist | null;
  play: (options: {
    uris?: string[];
    contextUri?: string;
    offsetIndex?: number;
    /** Start at a specific track URI inside the context (or uris list).
     * Used by SongView / AppSongView so a "play this track" button
     * actually starts the surrounding playlist context — that way
     * skip-next / skip-prev / on-end-advance behave like a real
     * playlist instead of stopping after one song. */
    offsetUri?: string;
    /** Which playlist this play() call is sourcing audio from. Stored
     * on `currentPlaylistId` so HomePage / PlaylistView / AppPlaylistView
     * can spin the right vinyl. Pure metadata — does not affect what
     * the Spotify SDK actually plays. */
    playlistId?: PlayingPlaylist;
  }) => Promise<void>;
  togglePlayPause: () => void;
  skipNext: () => void;
  skipPrev: () => void;
  seek: (ms: number) => void;
  toggleShuffle: () => Promise<void>;
  /** Push (or clear) the highlight for the currently-playing track.
   * Pass null to clear. The setter is a no-op if the track id on the
   * highlight doesn't match the track that's actually playing — this
   * way a slow Supabase round-trip can't apply a band to the *next*
   * song after a skip. */
  setCurrentFavoritePart: (value: FavoritePartHighlight | null) => void;
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
  // Page-pushed favorite-part highlight for whatever is currently
  // playing. See FavoritePartHighlight comment above. Cleared whenever
  // currentTrack.id transitions to a new value so a stale band never
  // bleeds onto a different song.
  const [currentFavoritePart, setCurrentFavoritePartState] =
    useState<FavoritePartHighlight | null>(null);
  // Last playlist that audio was sourced from. Updated inside play()
  // on every successful call; never auto-cleared (a paused playlist
  // is still "the active playlist" until the user kicks off another
  // one). Pages combine it with isPlaying to gate the spin animation.
  const [currentPlaylistId, setCurrentPlaylistId] =
    useState<PlayingPlaylist | null>(null);
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

  // Drop the favorite-part highlight whenever the track id changes.
  // This is genuinely a "synchronize derived state with an external
  // system" case: currentTrack flips asynchronously inside the Web
  // Playback SDK's player_state_changed callback, and we have to
  // react to that change here. The setter below also ignores stale
  // pushes — this effect handles the "user skipped past the song that
  // had a band, and no page is around to push a new one" path.
  useEffect(() => {
    setCurrentFavoritePartState((prev) => {
      if (!prev) return prev;
      if (!currentTrack || prev.trackId !== currentTrack.id) return null;
      return prev;
    });
    // currentTrack reference identity isn't stable; we only care about
    // the id transition here. The closure reads currentTrack, but the
    // dep we want to react to is the id, not the object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTrack?.id]);

  // Public setter. Clears unconditionally when passed null. When passed
  // a value, the trackId on the value MUST match what's currently
  // playing — otherwise the push is dropped on the floor. That guards
  // against a slow async fetch resolving after the user has skipped to
  // the next track and accidentally drawing a band on the wrong song.
  const setCurrentFavoritePart = useCallback(
    (value: FavoritePartHighlight | null) => {
      if (value === null) {
        setCurrentFavoritePartState(null);
        return;
      }
      if (!currentTrack || currentTrack.id !== value.trackId) return;
      setCurrentFavoritePartState(value);
    },
    [currentTrack]
  );

  const play = useCallback(
    async (options: {
      uris?: string[];
      contextUri?: string;
      offsetIndex?: number;
      offsetUri?: string;
      playlistId?: PlayingPlaylist;
    }) => {
      if (!deviceId || !token) return;
      // startPlayback only needs the SDK-relevant fields. playlistId
      // is metadata for our spin animation — strip it before forwarding.
      const { playlistId, ...sdkOptions } = options;
      await startPlayback(token, deviceId, sdkOptions);
      // Only update on success — a 4xx from Spotify shouldn't change
      // which playlist we display as "playing" since nothing actually
      // started.
      if (playlistId) setCurrentPlaylistId(playlistId);
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
        currentFavoritePart,
        currentPlaylistId,
        play,
        togglePlayPause,
        skipNext,
        skipPrev,
        seek,
        toggleShuffle,
        setCurrentFavoritePart,
      }}
    >
      {children}
    </PlayerContext.Provider>
  );
}

// Co-located hook (fast-refresh prefers separate files; not worth a
// split for a single hook).
// eslint-disable-next-line react-refresh/only-export-components
export function usePlayer() {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error("usePlayer must be used within PlayerProvider");
  return ctx;
}
