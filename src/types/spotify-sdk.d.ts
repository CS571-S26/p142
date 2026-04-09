interface SpotifyPlayerState {
  paused: boolean;
  position: number;
  duration: number;
  track_window: {
    current_track: {
      id: string;
      name: string;
      artists: { name: string }[];
      album: {
        name: string;
        images: { url: string }[];
      };
      duration_ms: number;
    };
  };
}

interface SpotifyPlayerDevice {
  device_id: string;
}

interface SpotifyPlayerError {
  message: string;
}

declare namespace Spotify {
  class Player {
    constructor(options: {
      name: string;
      getOAuthToken: (cb: (token: string) => void) => void;
      volume?: number;
    });
    connect(): Promise<boolean>;
    disconnect(): void;
    togglePlay(): Promise<void>;
    nextTrack(): Promise<void>;
    previousTrack(): Promise<void>;
    seek(positionMs: number): Promise<void>;
    addListener(
      event: "ready",
      cb: (device: SpotifyPlayerDevice) => void
    ): void;
    addListener(
      event: "not_ready",
      cb: (device: SpotifyPlayerDevice) => void
    ): void;
    addListener(
      event: "player_state_changed",
      cb: (state: SpotifyPlayerState | null) => void
    ): void;
    addListener(
      event: "initialization_error" | "authentication_error" | "account_error" | "playback_error",
      cb: (error: SpotifyPlayerError) => void
    ): void;
    removeListener(event: string): void;
  }
}

interface Window {
  onSpotifyWebPlaybackSDKReady: () => void;
}
