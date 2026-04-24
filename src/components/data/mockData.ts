export interface Song {
  id: string;
  title: string;
  artist: string;
  album: string;
  albumArt: string;
  noteCount: number;
  favoriteCount: number;
  duration: string;     // formatted for display, e.g. "3:45"
  durationMs?: number;  // raw ms, used when persisting to app_playlist_songs
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

export interface Note {
  id: string;
  userName: string;
  timestamp: string;
  likes: number;
  content: string;
}

const songs: Song[] = [
  {
    id: "s1",
    title: "Bohemian Rhapsody",
    artist: "Queen",
    album: "A Night at the Opera",
    albumArt: "https://placehold.co/300x300/1a1a2e/ffffff?text=Queen",
    noteCount: 12,
    favoriteCount: 48,
    duration: "5:55",
  },
  {
    id: "s2",
    title: "Stairway to Heaven",
    artist: "Led Zeppelin",
    album: "Led Zeppelin IV",
    albumArt: "https://placehold.co/300x300/16213e/ffffff?text=Zeppelin",
    noteCount: 8,
    favoriteCount: 35,
    duration: "8:02",
  },
  {
    id: "s3",
    title: "Hotel California",
    artist: "Eagles",
    album: "Hotel California",
    albumArt: "https://placehold.co/300x300/0f3460/ffffff?text=Eagles",
    noteCount: 5,
    favoriteCount: 22,
    duration: "6:30",
  },
  {
    id: "s4",
    title: "Blinding Lights",
    artist: "The Weeknd",
    album: "After Hours",
    albumArt: "https://placehold.co/300x300/e94560/ffffff?text=Weeknd",
    noteCount: 15,
    favoriteCount: 61,
    duration: "3:20",
  },
  {
    id: "s5",
    title: "Redbone",
    artist: "Childish Gambino",
    album: "Awaken, My Love!",
    albumArt: "https://placehold.co/300x300/533483/ffffff?text=Gambino",
    noteCount: 9,
    favoriteCount: 40,
    duration: "5:26",
  },
];

export const mockPlaylists: Playlist[] = [
  {
    id: "p1",
    name: "Classic Rock Anthems",
    description: "Timeless rock hits from the legends",
    vinylColor: "#1a1a2e",
    songCount: 3,
    songs: [songs[0], songs[1], songs[2]],
  },
  {
    id: "p2",
    name: "Late Night Vibes",
    description: "Smooth tracks for winding down",
    vinylColor: "#e94560",
    songCount: 2,
    songs: [songs[3], songs[4]],
  },
  {
    id: "p3",
    name: "Empty Playlist",
    description: "Add some songs to get started",
    vinylColor: "#0f3460",
    songCount: 0,
    songs: [],
  },
];

export const mockNotes: Record<string, Note[]> = {
  s1: [
    {
      id: "n1",
      userName: "MusicFan42",
      timestamp: "2 hours ago",
      likes: 5,
      content:
        "The operatic section still gives me chills every single time. Mercury's vocal range in this track is unmatched.",
    },
    {
      id: "n2",
      userName: "ClassicRockLover",
      timestamp: "1 day ago",
      likes: 3,
      content:
        "Fun fact: the band almost didn't release this as a single because they thought it was too long for radio.",
    },
  ],
  s4: [
    {
      id: "n3",
      userName: "SynthWaveRider",
      timestamp: "5 hours ago",
      likes: 8,
      content:
        "The 80s synth influence on this track is so well done. It feels both nostalgic and modern at the same time.",
    },
  ],
};
