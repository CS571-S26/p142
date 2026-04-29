export interface Song {
  id: string;
  title: string;
  artist: string;
  album: string;
  albumArt: string;
  noteCount: number;
  favoriteCount: number;
  duration: string; // formatted for display, e.g. "3:45"
  durationMs?: number; // raw ms, used when persisting to app_playlist_songs
  uri?: string;
}

export interface Playlist {
  id: string;
  name: string;
  description: string;
  vinylColor: string;
  songCount: number;
  songs: Song[];
}
