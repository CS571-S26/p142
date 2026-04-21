import { useEffect, useState } from "react";
import { Button } from "./ui/button";
import { useNavigate } from "react-router";
import { useSpotify } from "../data/SpotifyContext";
import { fetchUserPlaylists } from "../data/spotifyApi";
import type { Playlist } from "../data/mockData";
import { VinylRecord } from "./VinylRecord";
import { LogOut } from "lucide-react";
import { SpinDeckLogo } from "./SpinDeckLogo";

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
    <div className="min-h-screen w-full bg-[#FFF8E7] pb-24">
      <header className="border-b-2 border-[#3D2817] bg-[#FFE8BA] sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <SpinDeckLogo size={72} spinSeconds={0} />
            <h1 className="text-2xl font-bold text-[#3D2817]">Spin Deck</h1>
          </div>
          <Button
            variant="ghost"
            onClick={() => {
              logout();
              navigate("/");
            }}
            className="text-[#8B6F47] hover:text-red-600"
          >
            <LogOut className="size-4 mr-2" />
            Log out
          </Button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-8 py-12">
        <h2 className="text-3xl font-bold mb-8 text-[#3D2817]">Your Playlists</h2>

        {loading ? (
          <div className="text-center py-20 text-[#8B6F47]">
            <p className="text-lg">Loading your playlists...</p>
          </div>
        ) : error ? (
          <div className="text-center py-20 text-red-500">
            <p className="text-lg">{error}</p>
          </div>
        ) : playlists.length === 0 ? (
          <div className="text-center py-20 text-[#8B6F47]">
            <p className="text-lg">No playlists found on your Spotify account.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-8">
            {playlists.map((playlist) => (
              <div
                key={playlist.id}
                onClick={() => navigate(`/playlist/${playlist.id}`, {
                  state: { name: playlist.name, description: playlist.description, vinylColor: playlist.vinylColor, songCount: playlist.songCount },
                })}
                className="cursor-pointer group"
              >
                <div className="mb-4 flex justify-center">
                  <div className="transition-transform group-hover:scale-105 group-hover:rotate-12">
                    <VinylRecord color={playlist.vinylColor} size={180} />
                  </div>
                </div>
                <div className="text-center">
                  <h3 className="font-semibold text-lg mb-1 text-[#3D2817]">{playlist.name}</h3>
                  <p className="text-sm text-[#8B6F47]">{playlist.songCount} songs</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
