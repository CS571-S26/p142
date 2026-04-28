import { useCallback, useEffect, useState } from "react";
import { Button } from "./ui/button";
import { useNavigate } from "react-router";
import { useSpotify } from "../data/SpotifyContext";
import { useAppUser } from "../data/AppUserContext";
import { fetchUserPlaylists } from "../data/spotifyApi";
import type { Playlist } from "../data/mockData";
import {
  listMyPlaylists,
  type AppPlaylistSummary,
} from "../data/appPlaylistsApi";
import { listSavedPlaylists } from "../data/savedPlaylistsApi";
import { VinylRecord } from "./VinylRecord";
import { CreatePlaylistModal } from "./CreatePlaylistModal";
import { Bookmark, LogOut, Music, Plus } from "lucide-react";
import { SpinDeckLogo } from "./SpinDeckLogo";

export function HomePage() {
  const navigate = useNavigate();
  const { token, isConnected, login } = useSpotify();
  const { user, signOut } = useAppUser();

  // --- Spotify-synced playlists (only when connected) ---------------------
  const [spotifyPlaylists, setSpotifyPlaylists] = useState<Playlist[]>([]);
  // Lazy init: only show "loading" when we actually have a token to fetch
  // with. Avoids react-hooks/set-state-in-effect by keeping the effect
  // body free of synchronous setState calls.
  const [loadingSpotify, setLoadingSpotify] = useState<boolean>(() => Boolean(token));
  const [spotifyError, setSpotifyError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return; // no Spotify = no playlists to fetch; that's fine
    fetchUserPlaylists(token)
      .then((p) => setSpotifyPlaylists(p))
      .catch((e) => setSpotifyError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoadingSpotify(false));
  }, [token]);

  // --- App-native (annotated) playlists ----------------------------------
  const [appPlaylists, setAppPlaylists] = useState<AppPlaylistSummary[]>([]);
  const [loadingApp, setLoadingApp] = useState<boolean>(Boolean(user?.id));
  const [appError, setAppError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const loadAppPlaylists = useCallback(async () => {
    if (!user?.id) return;
    setLoadingApp(true);
    setAppError(null);
    try {
      const list = await listMyPlaylists(user.id);
      setAppPlaylists(list);
    } catch (e) {
      setAppError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingApp(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void loadAppPlaylists();
  }, [loadAppPlaylists]);

  // --- Saved (bookmarked) playlists --------------------------------------
  // These are app-playlists owned by other users that the current user has
  // saved to their library via the "Save" button on AppPlaylistView. They
  // render as a separate section so it's obvious which playlists you own
  // (editable) vs. which you've saved (read-only).
  const [savedPlaylists, setSavedPlaylists] = useState<AppPlaylistSummary[]>([]);
  const [loadingSaved, setLoadingSaved] = useState<boolean>(Boolean(user?.id));
  const [savedError, setSavedError] = useState<string | null>(null);

  const loadSavedPlaylists = useCallback(async () => {
    if (!user?.id) return;
    setLoadingSaved(true);
    setSavedError(null);
    try {
      const list = await listSavedPlaylists(user.id);
      setSavedPlaylists(list);
    } catch (e) {
      setSavedError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingSaved(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void loadSavedPlaylists();
  }, [loadSavedPlaylists]);

  return (
    <div className="min-h-screen w-full bg-[#FFF8E7] pb-24">
      <header className="border-b-2 border-[#3D2817] bg-[#FFE8BA] sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-8 py-3 sm:py-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <SpinDeckLogo size={56} spinSeconds={0} />
            <h1 className="text-xl sm:text-2xl font-bold text-[#3D2817] truncate">
              Spin Deck
            </h1>
          </div>
          <div className="flex items-center gap-1 sm:gap-3">
            {user && (
              <span className="text-sm text-[#8B6F47] hidden md:inline">
                @{user.username}
              </span>
            )}
            {!isConnected && (
              <Button
                variant="ghost"
                onClick={login}
                className="text-[#8B6F47] hover:text-[#3D2817] px-2 sm:px-4"
                aria-label="Connect Spotify"
              >
                <Music className="size-4 sm:mr-2" />
                <span className="hidden sm:inline">Connect Spotify</span>
              </Button>
            )}
            <Button
              variant="ghost"
              onClick={() => {
                void signOut();
              }}
              className="text-[#8B6F47] hover:text-red-600 px-2 sm:px-4"
              aria-label="Log out"
            >
              <LogOut className="size-4 sm:mr-2" />
              <span className="hidden sm:inline">Log out</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-8 py-6 sm:py-12 space-y-10 sm:space-y-16">
        {/* -------- Your SpinDeck Playlists (annotated, app-native) -------- */}
        <section>
          <div className="flex items-end justify-between mb-6 sm:mb-8 flex-wrap gap-4">
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold text-[#3D2817]">
                Your SpinDeck Playlists
              </h2>
              <p className="text-sm text-[#8B6F47] mt-1">
                Annotated playlists you've built in SpinDeck.
              </p>
            </div>
            <Button
              onClick={() => setShowCreate(true)}
              className="bg-[#FF9F45] hover:bg-[#FF8C2E] text-[#3D2817] font-semibold border-2 border-[#3D2817] shadow-[4px_4px_0px_0px_rgba(61,40,23,1)] hover:shadow-[2px_2px_0px_0px_rgba(61,40,23,1)] transition-all"
            >
              <Plus className="size-4 mr-2" />
              Create playlist
            </Button>
          </div>

          {loadingApp ? (
            <div className="text-center py-12 text-[#8B6F47]">
              <p>Loading your playlists…</p>
            </div>
          ) : appError ? (
            <div className="text-center py-12 text-red-600">
              <p>{appError}</p>
            </div>
          ) : appPlaylists.length === 0 ? (
            <div className="border-2 border-dashed border-[#8B6F47] rounded-lg p-10 text-center bg-white/50">
              <p className="text-[#3D2817] font-semibold mb-1">
                No SpinDeck playlists yet
              </p>
              <p className="text-sm text-[#8B6F47] mb-4">
                Build an annotated playlist to share with others — works with
                or without Spotify connected.
              </p>
              <Button
                onClick={() => setShowCreate(true)}
                className="bg-[#FF9F45] hover:bg-[#FF8C2E] text-[#3D2817] font-semibold border-2 border-[#3D2817] shadow-[4px_4px_0px_0px_rgba(61,40,23,1)] hover:shadow-[2px_2px_0px_0px_rgba(61,40,23,1)] transition-all"
              >
                <Plus className="size-4 mr-2" />
                Create your first playlist
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6 md:gap-8">
              {appPlaylists.map((pl) => (
                <div
                  key={pl.id}
                  onClick={() => navigate(`/app-playlist/${pl.id}`)}
                  className="cursor-pointer group"
                >
                  <div className="mb-3 sm:mb-4 flex justify-center">
                    <div className="transition-transform group-hover:scale-105 group-hover:rotate-12">
                      <VinylRecord
                        color={pl.vinylColor}
                        className="size-32 sm:size-40 md:size-44"
                      />
                    </div>
                  </div>
                  <div className="text-center">
                    <h3 className="font-semibold text-base sm:text-lg mb-1 text-[#3D2817] line-clamp-2">
                      {pl.name}
                    </h3>
                    <p className="text-xs sm:text-sm text-[#8B6F47]">
                      {pl.songCount} {pl.songCount === 1 ? "song" : "songs"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* -------- Saved playlists (bookmarked from others) -------- */}
        {/* Live bookmarks: clicking a card opens the canonical playlist
            view, where the owner's edits — track adds/removes,
            annotations, name — show up immediately. The Save button on
            that page flips to "Saved ✓" so the user can unsave from
            either there or by deleting bookmarks here later. */}
        <section>
          <div className="mb-6 sm:mb-8">
            <h2 className="text-2xl sm:text-3xl font-bold text-[#3D2817]">
              Saved Playlists
            </h2>
            <p className="text-sm text-[#8B6F47] mt-1">
              Annotated playlists from other users that you've saved.
            </p>
          </div>

          {loadingSaved ? (
            <div className="text-center py-12 text-[#8B6F47]">
              <p>Loading saved playlists…</p>
            </div>
          ) : savedError ? (
            <div className="text-center py-12 text-red-600">
              <p>{savedError}</p>
            </div>
          ) : savedPlaylists.length === 0 ? (
            <div className="border-2 border-dashed border-[#8B6F47] rounded-lg p-8 sm:p-10 text-center bg-white/50">
              <Bookmark className="size-6 mx-auto mb-2 text-[#8B6F47]" />
              <p className="text-[#3D2817] font-semibold mb-1">
                No saved playlists yet
              </p>
              <p className="text-sm text-[#8B6F47]">
                When someone shares a SpinDeck playlist link with you, tap
                <span className="font-semibold"> Save </span>
                on the playlist page to keep it here.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6 md:gap-8">
              {savedPlaylists.map((pl) => (
                <div
                  key={pl.id}
                  onClick={() => navigate(`/app-playlist/${pl.id}`)}
                  className="cursor-pointer group"
                >
                  <div className="mb-3 sm:mb-4 flex justify-center">
                    <div className="transition-transform group-hover:scale-105 group-hover:rotate-12">
                      <VinylRecord
                        color={pl.vinylColor}
                        className="size-32 sm:size-40 md:size-44"
                      />
                    </div>
                  </div>
                  <div className="text-center">
                    <h3 className="font-semibold text-base sm:text-lg mb-1 text-[#3D2817] line-clamp-2">
                      {pl.name}
                    </h3>
                    <p className="text-xs sm:text-sm text-[#8B6F47]">
                      {pl.songCount} {pl.songCount === 1 ? "song" : "songs"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* -------- Spotify-synced playlists -------- */}
        <section>
          <div className="mb-6 sm:mb-8">
            <h2 className="text-2xl sm:text-3xl font-bold text-[#3D2817]">
              Your Spotify Playlists
            </h2>
            <p className="text-sm text-[#8B6F47] mt-1">
              {isConnected
                ? "Synced from your Spotify account."
                : "Connect Spotify to sync and play your playlists here."}
            </p>
          </div>

          {!isConnected ? (
            <div className="border-2 border-[#3D2817] rounded-lg p-10 bg-white shadow-[4px_4px_0px_0px_rgba(61,40,23,0.3)]">
              <div className="max-w-xl">
                <h3 className="text-xl font-bold text-[#3D2817] mb-2">
                  Spotify isn't connected yet
                </h3>
                <p className="text-[#8B6F47] mb-6">
                  Connect your Spotify account to see your personal playlists
                  here and play tracks in-app. Your SpinDeck playlists and
                  annotations work without it.
                </p>
                <Button
                  onClick={login}
                  className="bg-[#FF9F45] hover:bg-[#FF8C2E] text-[#3D2817] font-semibold border-2 border-[#3D2817] shadow-[4px_4px_0px_0px_rgba(61,40,23,1)] hover:shadow-[2px_2px_0px_0px_rgba(61,40,23,1)] transition-all"
                >
                  <Music className="size-4 mr-2" />
                  Connect Spotify
                </Button>
              </div>
            </div>
          ) : loadingSpotify ? (
            <div className="text-center py-12 text-[#8B6F47]">
              <p className="text-lg">Loading your playlists...</p>
            </div>
          ) : spotifyError ? (
            <div className="text-center py-12 text-red-500">
              <p className="text-lg">{spotifyError}</p>
            </div>
          ) : spotifyPlaylists.length === 0 ? (
            <div className="text-center py-12 text-[#8B6F47]">
              <p className="text-lg">
                No playlists found on your Spotify account.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6 md:gap-8">
              {spotifyPlaylists.map((playlist) => (
                <div
                  key={playlist.id}
                  onClick={() =>
                    navigate(`/playlist/${playlist.id}`, {
                      state: {
                        name: playlist.name,
                        description: playlist.description,
                        vinylColor: playlist.vinylColor,
                        songCount: playlist.songCount,
                      },
                    })
                  }
                  className="cursor-pointer group"
                >
                  <div className="mb-3 sm:mb-4 flex justify-center">
                    <div className="transition-transform group-hover:scale-105 group-hover:rotate-12">
                      <VinylRecord
                        color={playlist.vinylColor}
                        className="size-32 sm:size-40 md:size-44"
                      />
                    </div>
                  </div>
                  <div className="text-center">
                    <h3 className="font-semibold text-base sm:text-lg mb-1 text-[#3D2817] line-clamp-2">
                      {playlist.name}
                    </h3>
                    <p className="text-xs sm:text-sm text-[#8B6F47]">
                      {playlist.songCount} songs
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      {showCreate && user?.id && (
        <CreatePlaylistModal
          ownerId={user.id}
          onClose={() => setShowCreate(false)}
          onCreated={(pl) => {
            setShowCreate(false);
            // Optimistically prepend so the card appears immediately on Home
            // even if the user bounces back before refetching.
            setAppPlaylists((prev) => [
              { ...pl, songCount: 0 },
              ...prev.filter((p) => p.id !== pl.id),
            ]);
            navigate(`/app-playlist/${pl.id}?edit=1`);
          }}
        />
      )}
    </div>
  );
}
