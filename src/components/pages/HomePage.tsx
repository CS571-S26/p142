import { useCallback, useEffect, useState } from "react";
import { Button } from "./ui/button";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useSpotify } from "../data/SpotifyContext";
import { useAppUser } from "../data/AppUserContext";
import { usePlayer } from "../data/PlayerContext";
import { fetchUserPlaylists } from "../data/spotifyApi";
import type { Playlist } from "../data/types";
import {
  listMyPlaylists,
  type AppPlaylistSummary,
} from "../data/appPlaylistsApi";
import { listSavedPlaylists } from "../data/savedPlaylistsApi";
import { listPendingInvites } from "../data/invitesApi";
import { VinylRecord } from "./VinylRecord";
import { CreatePlaylistModal } from "./CreatePlaylistModal";
import {
  Bookmark,
  CircleUser,
  LogOut,
  Mail,
  Music,
  Plus,
} from "lucide-react";
import { SpinDeckLogo } from "./SpinDeckLogo";

// ---------------------------------------------------------------------------
// Filter pills across the top of /home. Each pill toggles whether the
// matching section renders below. State lives in ?show=… so a user can
// share or bookmark a filtered view; an absent param means "show all".
// ---------------------------------------------------------------------------

type HomeSection = "playlists" | "saved" | "spotify";
const SECTION_IDS: HomeSection[] = ["playlists", "saved", "spotify"];
const SECTION_LABELS: Record<HomeSection, string> = {
  playlists: "Your Playlists",
  saved: "Saved",
  spotify: "Spotify",
};

function parseShowParam(raw: string | null): Set<HomeSection> {
  // No param → show everything (the common case). An explicit empty
  // value (?show=) is honored as "show none" so users can deliberately
  // hide every section if they want.
  if (raw === null) return new Set(SECTION_IDS);
  if (raw === "") return new Set();
  const visible = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is HomeSection => (SECTION_IDS as string[]).includes(s));
  return new Set(visible);
}

export function HomePage() {
  const navigate = useNavigate();
  const { token, isConnected, login } = useSpotify();
  const { user, signOut } = useAppUser();
  const { currentPlaylistId, isPlaying } = usePlayer();
  const [searchParams, setSearchParams] = useSearchParams();

  // Helper: is this card the playlist whose audio is currently playing?
  // Combines the active-playlist tag with isPlaying so paused playlists
  // stay still, matching the user's intuition of "spinning = audio in
  // motion." Two helpers because cards from /me/playlists are Spotify-
  // sourced while SpinDeck cards are app-sourced.
  const isAppPlaylistPlaying = (id: string) =>
    isPlaying &&
    currentPlaylistId?.kind === "app" &&
    currentPlaylistId.id === id;
  const isSpotifyPlaylistPlaying = (id: string) =>
    isPlaying &&
    currentPlaylistId?.kind === "spotify" &&
    currentPlaylistId.id === id;

  const visible = parseShowParam(searchParams.get("show"));

  function toggleSection(section: HomeSection) {
    const next = new Set(visible);
    if (next.has(section)) next.delete(section);
    else next.add(section);

    const params = new URLSearchParams(searchParams);
    if (next.size === SECTION_IDS.length) {
      // All on is the default — drop the param entirely so the URL
      // stays clean for the most common state.
      params.delete("show");
    } else {
      // Preserve the canonical order from SECTION_IDS so the URL is
      // stable regardless of which order the user clicked things.
      params.set(
        "show",
        SECTION_IDS.filter((id) => next.has(id)).join(",")
      );
    }
    setSearchParams(params, { replace: true });
  }

  function resetFilters() {
    const params = new URLSearchParams(searchParams);
    params.delete("show");
    setSearchParams(params, { replace: true });
  }

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

  // --- Invites count (for the header badge only) -------------------------
  // The full inbox lives on /invites; here we just need the pending
  // count to feed the bell icon. One small Supabase round-trip on
  // mount is plenty — invites are low-volume and the page already
  // makes several queries.
  const [pendingInvitesCount, setPendingInvitesCount] = useState<number>(0);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    listPendingInvites(user.id)
      .then((list) => {
        if (!cancelled) setPendingInvitesCount(list.length);
      })
      .catch(() => {
        // Badge is non-critical; if the count fetch fails we just don't
        // show a number. The /invites page will surface the real error.
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

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
            {/* @username chip → /profile. Visible on tablet/desktop only,
                because the profile icon below already covers phones
                where row width is tight. */}
            {user && (
              <Link
                to="/profile"
                className="text-sm text-[#785A38] hover:text-[#3D2817] hover:underline hidden md:inline rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FF9F45]"
              >
                @{user.username}
              </Link>
            )}
            {!isConnected && (
              <Button
                variant="ghost"
                onClick={login}
                className="text-[#785A38] hover:text-[#3D2817] px-2 sm:px-4"
                aria-label="Connect Spotify"
              >
                <Music className="size-4 sm:mr-2" />
                <span className="hidden sm:inline">Connect Spotify</span>
              </Button>
            )}
            {/* Invites bell — links to /invites. The badge shows the
                pending count when it's > 0. Notifications-style chip
                in the top-right corner of the icon so it's obvious at
                a glance when something needs attention. */}
            {user && (
              <Link
                to="/invites"
                aria-label={
                  pendingInvitesCount > 0
                    ? `Invites — ${pendingInvitesCount} pending`
                    : "Invites"
                }
                className="relative text-[#785A38] hover:text-[#3D2817] p-2 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FF9F45]"
              >
                <Mail className="size-5" />
                {pendingInvitesCount > 0 && (
                  <span
                    aria-hidden="true"
                    className="absolute -top-0.5 -right-0.5 inline-flex items-center justify-center min-w-[1.1rem] h-[1.1rem] px-1 rounded-full bg-[#FF9F45] text-[#3D2817] text-[10px] leading-none font-bold border-2 border-[#3D2817]"
                  >
                    {pendingInvitesCount > 9 ? "9+" : pendingInvitesCount}
                  </span>
                )}
              </Link>
            )}
            {/* Profile icon — second entry point so the link is one tap
                from anywhere, regardless of viewport width. */}
            {user && (
              <Link
                to="/profile"
                aria-label="Your profile"
                className="text-[#785A38] hover:text-[#3D2817] p-2 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FF9F45]"
              >
                <CircleUser className="size-5" />
              </Link>
            )}
            <Button
              variant="ghost"
              onClick={() => {
                void signOut();
              }}
              className="text-[#785A38] hover:text-red-600 px-2 sm:px-4"
              aria-label="Log out"
            >
              <LogOut className="size-4 sm:mr-2" />
              <span className="hidden sm:inline">Log out</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-8 py-6 sm:py-12 space-y-10 sm:space-y-16">
        {/* Filter pills — multi-select toggles for the three sections
            below. Click a pill to hide / show that section. State
            lives in ?show=… so users can share a filtered view. All
            on is the default and stays out of the URL. */}
        <div className="-mt-2 mb-6 sm:mb-8 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-[#785A38] uppercase tracking-wide mr-1">
            Show
          </span>
          {SECTION_IDS.map((id) => {
            const on = visible.has(id);
            return (
              <button
                key={id}
                type="button"
                onClick={() => toggleSection(id)}
                aria-pressed={on}
                className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold border-2 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FF9F45] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FFF8E7] ${
                  on
                    ? "bg-[#FF9F45] text-[#3D2817] border-[#3D2817] shadow-[2px_2px_0px_0px_rgba(61,40,23,1)]"
                    : "bg-white text-[#785A38] border-[#785A38]/40 line-through hover:text-[#3D2817] hover:border-[#3D2817]"
                }`}
              >
                {SECTION_LABELS[id]}
              </button>
            );
          })}
          {/* Reset link only shows up when at least one filter is off,
              so the row stays quiet in the default state. */}
          {visible.size !== SECTION_IDS.length && (
            <button
              type="button"
              onClick={resetFilters}
              className="ml-1 text-xs font-semibold text-[#3D2817] underline hover:text-[#FF8C2E] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FF9F45] rounded px-1"
            >
              Reset
            </button>
          )}
        </div>

        {/* When every filter is off the page would be empty otherwise —
            give the user a small nudge back to the default view rather
            than a giant white expanse. */}
        {visible.size === 0 && (
          <div className="border-2 border-dashed border-[#785A38] rounded-lg p-8 text-center bg-white/50">
            <p className="text-[#3D2817] font-semibold mb-1">
              Nothing to show
            </p>
            <p className="text-sm text-[#785A38] mb-3">
              You've hidden every section. Toggle a pill above to bring
              it back, or reset to see everything.
            </p>
            <Button onClick={resetFilters} variant="outline">
              Reset filters
            </Button>
          </div>
        )}

        {/* -------- Your SpinDeck Playlists (annotated, app-native) -------- */}
        {visible.has("playlists") && <section>
          <div className="flex items-end justify-between mb-6 sm:mb-8 flex-wrap gap-4">
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold text-[#3D2817]">
                Your SpinDeck Playlists
              </h2>
              <p className="text-sm text-[#785A38] mt-1">
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
            <div className="text-center py-12 text-[#785A38]">
              <p>Loading your playlists…</p>
            </div>
          ) : appError ? (
            <div className="text-center py-12 text-red-600">
              <p>{appError}</p>
            </div>
          ) : appPlaylists.length === 0 ? (
            <div className="border-2 border-dashed border-[#785A38] rounded-lg p-10 text-center bg-white/50">
              <p className="text-[#3D2817] font-semibold mb-1">
                No SpinDeck playlists yet
              </p>
              <p className="text-sm text-[#785A38] mb-4">
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
                // Real <button> so keyboard users can Tab to a card and
                // press Enter / Space to open it. Was a <div onClick>,
                // which mouse users could click but keyboard users could
                // not. type="button" prevents accidental form submits.
                <button
                  key={pl.id}
                  type="button"
                  onClick={() => navigate(`/app-playlist/${pl.id}`)}
                  className="text-left cursor-pointer group rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FF9F45] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FFF8E7]"
                >
                  <div className="mb-3 sm:mb-4 flex justify-center">
                    <div className="transition-transform group-hover:scale-105">
                      <VinylRecord
                        color={pl.vinylColor}
                        className="size-32 sm:size-40 md:size-44"
                        spinning={isAppPlaylistPlaying(pl.id)}
                      />
                    </div>
                  </div>
                  <div className="text-center">
                    <h3 className="font-semibold text-base sm:text-lg mb-1 text-[#3D2817] line-clamp-2">
                      {pl.name}
                    </h3>
                    <p className="text-xs sm:text-sm text-[#785A38]">
                      {pl.songCount} {pl.songCount === 1 ? "song" : "songs"}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>}

        {/* Invites used to live as a section here. They've been promoted
            to a dedicated /invites page, reachable from the bell icon
            in the header above. The bell badge feeds off
            pendingInvitesCount so /home still surfaces "you have N
            pending" at a glance. */}

        {/* -------- Saved playlists (bookmarked from others) -------- */}
        {/* Live bookmarks: clicking a card opens the canonical playlist
            view, where the owner's edits — track adds/removes,
            annotations, name — show up immediately. The Save button on
            that page flips to "Saved ✓" so the user can unsave from
            either there or by deleting bookmarks here later. */}
        {visible.has("saved") && <section>
          <div className="mb-6 sm:mb-8">
            <h2 className="text-2xl sm:text-3xl font-bold text-[#3D2817]">
              Saved Playlists
            </h2>
            <p className="text-sm text-[#785A38] mt-1">
              Annotated playlists from other users that you've saved.
            </p>
          </div>

          {loadingSaved ? (
            <div className="text-center py-12 text-[#785A38]">
              <p>Loading saved playlists…</p>
            </div>
          ) : savedError ? (
            <div className="text-center py-12 text-red-600">
              <p>{savedError}</p>
            </div>
          ) : savedPlaylists.length === 0 ? (
            <div className="border-2 border-dashed border-[#785A38] rounded-lg p-8 sm:p-10 text-center bg-white/50">
              <Bookmark className="size-6 mx-auto mb-2 text-[#785A38]" />
              <p className="text-[#3D2817] font-semibold mb-1">
                No saved playlists yet
              </p>
              <p className="text-sm text-[#785A38]">
                When someone shares a SpinDeck playlist link with you, tap
                <span className="font-semibold"> Save </span>
                on the playlist page to keep it here.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6 md:gap-8">
              {savedPlaylists.map((pl) => (
                <button
                  key={pl.id}
                  type="button"
                  onClick={() => navigate(`/app-playlist/${pl.id}`)}
                  className="text-left cursor-pointer group rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FF9F45] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FFF8E7]"
                >
                  <div className="mb-3 sm:mb-4 flex justify-center">
                    <div className="transition-transform group-hover:scale-105">
                      <VinylRecord
                        color={pl.vinylColor}
                        className="size-32 sm:size-40 md:size-44"
                        spinning={isAppPlaylistPlaying(pl.id)}
                      />
                    </div>
                  </div>
                  <div className="text-center">
                    <h3 className="font-semibold text-base sm:text-lg mb-1 text-[#3D2817] line-clamp-2">
                      {pl.name}
                    </h3>
                    <p className="text-xs sm:text-sm text-[#785A38]">
                      {pl.songCount} {pl.songCount === 1 ? "song" : "songs"}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>}

        {/* -------- Spotify-synced playlists -------- */}
        {/* The connect-CTA lives inside this section so users without
            Spotify still see it (and can hide it via the filter pill
            once they're done with it). */}
        {visible.has("spotify") && <section>
          <div className="mb-6 sm:mb-8">
            <h2 className="text-2xl sm:text-3xl font-bold text-[#3D2817]">
              Your Spotify Playlists
            </h2>
            <p className="text-sm text-[#785A38] mt-1">
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
                <p className="text-[#785A38] mb-6">
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
            <div className="text-center py-12 text-[#785A38]">
              <p className="text-lg">Loading your playlists...</p>
            </div>
          ) : spotifyError ? (
            <div className="text-center py-12 text-red-500">
              <p className="text-lg">{spotifyError}</p>
            </div>
          ) : spotifyPlaylists.length === 0 ? (
            <div className="text-center py-12 text-[#785A38]">
              <p className="text-lg">
                No playlists found on your Spotify account.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6 md:gap-8">
              {spotifyPlaylists.map((playlist) => (
                <button
                  key={playlist.id}
                  type="button"
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
                  className="text-left cursor-pointer group rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FF9F45] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FFF8E7]"
                >
                  <div className="mb-3 sm:mb-4 flex justify-center">
                    <div className="transition-transform group-hover:scale-105">
                      <VinylRecord
                        color={playlist.vinylColor}
                        className="size-32 sm:size-40 md:size-44"
                        spinning={isSpotifyPlaylistPlaying(playlist.id)}
                      />
                    </div>
                  </div>
                  <div className="text-center">
                    <h3 className="font-semibold text-base sm:text-lg mb-1 text-[#3D2817] line-clamp-2">
                      {playlist.name}
                    </h3>
                    <p className="text-xs sm:text-sm text-[#785A38]">
                      {playlist.songCount} songs
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>}
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
