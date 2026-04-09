import { useEffect, useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router";
import { ArrowLeft, LogOut, MessageSquare, Play } from "lucide-react";
import { Button } from "./ui/button";
import { useSpotify } from "../data/SpotifyContext";
import { usePlayer } from "../data/PlayerContext";
import { fetchPlaylistDetail } from "../data/spotifyApi";
import type { PlaylistDetail } from "../data/spotifyApi";
import { VinylRecord } from "./VinylRecord";

const DEFAULT_COLOR = "#1a1a2e";

export function PlaylistView() {
  const { playlistId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { token, logout } = useSpotify();
  const { play, isReady } = usePlayer();

  const routeState = location.state as {
    name?: string;
    description?: string;
    vinylColor?: string;
    songCount?: number;
  } | null;

  const [detail, setDetail] = useState<PlaylistDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !playlistId) return;
    fetchPlaylistDetail(token, playlistId)
      .then(setDetail)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token, playlistId]);

  const playlistName = detail?.name ?? routeState?.name ?? "Playlist";
  const vinylColor = routeState?.vinylColor ?? DEFAULT_COLOR;
  const songCount = detail?.songCount ?? routeState?.songCount ?? 0;
  const songs = detail?.songs ?? [];

  return (
    <div className="min-h-screen w-full bg-white pb-24">
      <header className="border-b border-gray-200 bg-white sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-8 py-4 flex items-center justify-between">
          <Button 
            variant="ghost" 
            onClick={() => navigate("/home")}
          >
            <ArrowLeft className="size-5 mr-2" />
            Back
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              logout();
              navigate("/");
            }}
            className="text-gray-500 hover:text-red-600"
          >
            <LogOut className="size-4 mr-2" />
            Log out
          </Button>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-8 py-12">
        <div className="flex items-start gap-8 mb-12">
          <div className="flex-shrink-0">
            <VinylRecord color={vinylColor} size={200} />
          </div>
          <div className="flex-1 pt-8">
            <h1 className="text-4xl font-bold mb-2">{playlistName}</h1>
            <p className="text-sm text-gray-500 mb-4">{songCount} songs</p>
            {isReady && songs.length > 0 && (
              <Button
                onClick={(e) => {
                  e.stopPropagation();
                  play({ contextUri: `spotify:playlist:${playlistId}` });
                }}
                className="bg-black hover:bg-gray-800 text-white"
              >
                <Play className="size-4 mr-2" />
                Play All
              </Button>
            )}
          </div>
        </div>

        <div className="space-y-1">
          <div className="px-4 py-2 text-sm text-gray-500 font-medium border-b border-gray-200">
            Songs
          </div>

          {loading ? (
            <div className="px-4 py-12 text-center text-gray-400">
              <p>Loading tracks...</p>
            </div>
          ) : error ? (
            <div className="px-4 py-12 text-center text-gray-500">
              <p className="font-semibold mb-2">
                {error.includes("403")
                  ? "This playlist is restricted"
                  : "Something went wrong"}
              </p>
              <p className="text-sm text-gray-400">
                {error.includes("403")
                  ? "Spotify blocks API access to algorithmic and editorial playlists (Discover Weekly, Daily Mix, etc.). Try one of your own playlists."
                  : error}
              </p>
            </div>
          ) : songs.length === 0 ? (
            <div className="px-4 py-12 text-center text-gray-400">
              <p>No songs in this playlist yet</p>
            </div>
          ) : (
            songs.map((song, index) => (
              <div
                key={song.id}
                onClick={() => navigate(`/playlist/${playlistId}/song/${song.id}`)}
                className="px-4 py-4 hover:bg-gray-50 transition-colors cursor-pointer border-b border-gray-100 group"
              >
                <div className="flex items-center gap-4">
                  <div className="w-8 text-gray-400 text-sm text-right relative">
                    <span className="group-hover:invisible">{index + 1}</span>
                    {isReady && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          play({
                            contextUri: `spotify:playlist:${playlistId}`,
                            offsetIndex: index,
                          });
                        }}
                        className="absolute inset-0 flex items-center justify-center invisible group-hover:visible"
                      >
                        <Play className="size-4 text-black" />
                      </button>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold group-hover:underline">
                      {song.title}
                    </h3>
                    <p className="text-sm text-gray-600">{song.artist}</p>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-gray-500">
                    <div className="flex items-center gap-1">
                      <MessageSquare className="size-4" />
                      <span>{song.noteCount}</span>
                    </div>
                    <div className="text-gray-400">
                      {song.duration}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
