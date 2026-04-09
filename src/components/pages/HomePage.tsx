import { useEffect, useState } from "react";
import { Button } from "./ui/button";
import { useNavigate } from "react-router";
import { useSpotify } from "../data/SpotifyContext";
import { fetchUserPlaylists } from "../data/spotifyApi";
import type { Playlist } from "../data/mockData";
import { VinylRecord } from "./VinylRecord";
import { LogOut } from "lucide-react";

export function HomePage() {
  const navigate = useNavigate();
  const { token, logout } = useSpotify();
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError("No Spotify token — go back and connect.");
      setLoading(false);
      return;
    }
    fetchUserPlaylists(token)
      .then(setPlaylists)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <div className="min-h-screen w-full bg-white">
      <header className="border-b border-gray-200 bg-white sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-8 py-6">
          <h1 className="text-3xl font-bold">Your Playlists</h1>
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

      <div className="max-w-4xl mx-auto px-8 py-8">
        {loading ? (
          <div className="text-center py-20 text-gray-400">
            <p className="text-lg">Loading your playlists...</p>
          </div>
        ) : error ? (
          <div className="text-center py-20 text-red-500">
            <p className="text-lg">{error}</p>
          </div>
        ) : playlists.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <p className="text-lg">No playlists found on your Spotify account.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {playlists.map((playlist) => (
              <div
                key={playlist.id}
                onClick={() => navigate(`/playlist/${playlist.id}`, {
                  state: { name: playlist.name, description: playlist.description, vinylColor: playlist.vinylColor, songCount: playlist.songCount },
                })}
                className="group cursor-pointer"
              >
                <div className="flex justify-center mb-4 transition-transform group-hover:scale-105">
                  <VinylRecord color={playlist.vinylColor} size={160} />
                </div>
                <h3 className="font-semibold text-lg group-hover:underline">
                  {playlist.name}
                </h3>
                <p className="text-sm text-gray-500 mt-1">{playlist.description}</p>
                <p className="text-xs text-gray-400 mt-1">{playlist.songCount} songs</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
