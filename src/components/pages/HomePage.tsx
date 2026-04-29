import { useCallback, useEffect, useState } from "react";
import { Button } from "./ui/button";
import { useNavigate } from "react-router";
import { useSpotify } from "../data/SpotifyContext";
import { useAppUser } from "../data/AppUserContext";
import { fetchUserPlaylists } from "../data/spotifyApi";
import type { Playlist } from "../data/types";
import {
  listMyPlaylists,
  type AppPlaylistSummary,
} from "../data/appPlaylistsApi";
import { listSavedPlaylists } from "../data/savedPlaylistsApi";
import {
  listPendingInvites,
  respondToInvite,
  type PendingInvite,
} from "../data/invitesApi";
import { formatError } from "../data/formatError";
import { VinylRecord } from "./VinylRecord";
import { CreatePlaylistModal } from "./CreatePlaylistModal";
import { Bookmark, Check, LogOut, Mail, Music, Plus, X } from "lucide-react";
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

  // --- Pending invites ----------------------------------------------------
  // Inbox of playlist invites where the current user is the recipient. The
  // list is small (one row per pending invite) so we just refetch on
  // mount and after each accept/decline rather than wiring up a websocket.
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [loadingInvites, setLoadingInvites] = useState<boolean>(Boolean(user?.id));
  const [invitesError, setInvitesError] = useState<string | null>(null);
  // Track which invite is currently being responded to so we can disable
  // its buttons (and grey them out) without locking the rest of the inbox.
  const [respondingInviteId, setRespondingInviteId] = useState<string | null>(
    null
  );

  const loadInvites = useCallback(async () => {
    if (!user?.id) return;
    setLoadingInvites(true);
    setInvitesError(null);
    try {
      const list = await listPendingInvites(user.id);
      setInvites(list);
    } catch (e) {
      setInvitesError(formatError(e, "Couldn't load invites."));
    } finally {
      setLoadingInvites(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void loadInvites();
  }, [loadInvites]);

  async function handleInviteResponse(
    invite: PendingInvite,
    action: "accept" | "decline"
  ) {
    if (!user?.id) return;
    if (respondingInviteId) return; // one at a time
    setRespondingInviteId(invite.id);
    // Optimistically pop the row out — if the call fails we put it back.
    const snapshot = invites;
    setInvites((prev) => prev.filter((i) => i.id !== invite.id));
    try {
      await respondToInvite({
        inviteId: invite.id,
        recipientId: user.id,
        playlistId: invite.playlistId,
        action,
      });
      // Accept auto-saves the playlist; refresh Saved Playlists so the
      // bookmark card appears below without a hard reload.
      if (action === "accept") {
        void loadSavedPlaylists();
      }
    } catch (e) {
      setInvites(snapshot);
      setInvitesError(
        formatError(e, "Couldn't update invite. Please try again.")
      );
    } finally {
      setRespondingInviteId(null);
    }
  }

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
        {isConnected && <section>
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
        </section>}

        {/* -------- Invites (incoming, pending) -------- */}
        {/* Top of the social stack. We always render the section header so
            the empty state can teach the feature; once the user has
            invites, each row gets Accept (auto-saves to library + drops
            into Saved Playlists) or Decline. */}
        <section>
          <div className="mb-6 sm:mb-8">
            <h2 className="text-2xl sm:text-3xl font-bold text-[#3D2817] flex items-center gap-2">
              <Mail className="size-6 sm:size-7" />
              Invites
              {invites.length > 0 && (
                <span className="ml-1 inline-flex items-center justify-center min-w-[1.5rem] h-6 px-2 rounded-full bg-[#FF9F45] text-[#3D2817] text-sm font-bold border-2 border-[#3D2817]">
                  {invites.length}
                </span>
              )}
            </h2>
            <p className="text-sm text-[#8B6F47] mt-1">
              Playlists other SpinDeck users have sent you. Accept to save
              them straight to your library.
            </p>
          </div>

          {loadingInvites ? (
            <div className="text-center py-12 text-[#8B6F47]">
              <p>Loading invites…</p>
            </div>
          ) : invitesError ? (
            <div className="text-center py-12 text-red-600">
              <p>{invitesError}</p>
            </div>
          ) : invites.length === 0 ? (
            <div className="border-2 border-dashed border-[#8B6F47] rounded-lg p-8 sm:p-10 text-center bg-white/50">
              <Mail className="size-6 mx-auto mb-2 text-[#8B6F47]" />
              <p className="text-[#3D2817] font-semibold mb-1">
                No invites right now
              </p>
              <p className="text-sm text-[#8B6F47]">
                When another SpinDeck user invites you to a playlist, it'll
                land here. Open any playlist and tap{" "}
                <span className="font-semibold">Invite</span> to send one of
                your own.
              </p>
            </div>
          ) : (
            <ul className="space-y-3 sm:space-y-4">
              {invites.map((invite) => {
                const responding = respondingInviteId === invite.id;
                return (
                  <li
                    key={invite.id}
                    className="border-2 border-[#3D2817] rounded-lg bg-white shadow-[4px_4px_0px_0px_rgba(61,40,23,1)] p-4 sm:p-5 flex flex-col sm:flex-row gap-4 sm:gap-5 items-stretch sm:items-center"
                  >
                    <button
                      type="button"
                      onClick={() =>
                        navigate(`/app-playlist/${invite.playlistId}`)
                      }
                      className="flex-shrink-0 self-center sm:self-auto"
                      title={`Preview "${invite.playlistName}"`}
                    >
                      <VinylRecord
                        color={invite.playlistVinylColor}
                        className="size-24 sm:size-28 transition-transform hover:scale-105 hover:rotate-12"
                      />
                    </button>

                    <div className="flex-1 min-w-0 text-center sm:text-left">
                      <p className="text-xs text-[#8B6F47] mb-1">
                        From{" "}
                        <span className="font-semibold text-[#3D2817]">
                          @{invite.senderUsername}
                        </span>
                        {invite.senderDisplayName
                          ? ` (${invite.senderDisplayName})`
                          : ""}
                      </p>
                      <h3 className="font-semibold text-base sm:text-lg text-[#3D2817] line-clamp-2">
                        {invite.playlistName}
                      </h3>
                      <p className="text-xs sm:text-sm text-[#8B6F47] mb-2">
                        {invite.playlistSongCount}{" "}
                        {invite.playlistSongCount === 1 ? "song" : "songs"}
                      </p>
                      {invite.message && (
                        <blockquote className="border-l-4 border-[#FF9F45] pl-3 py-1 text-sm text-[#3D2817] whitespace-pre-wrap bg-[#FFF8E7] rounded-r text-left">
                          {invite.message}
                        </blockquote>
                      )}
                    </div>

                    <div className="flex flex-row sm:flex-col gap-2 sm:gap-2 justify-center sm:justify-start sm:self-center flex-shrink-0">
                      <Button
                        onClick={() =>
                          void handleInviteResponse(invite, "accept")
                        }
                        disabled={responding}
                        className="bg-[#FF9F45] hover:bg-[#FF8C2E] text-[#3D2817] font-semibold border-2 border-[#3D2817] shadow-[4px_4px_0px_0px_rgba(61,40,23,1)] hover:shadow-[2px_2px_0px_0px_rgba(61,40,23,1)] transition-all"
                      >
                        <Check className="size-4 mr-1" />
                        {responding ? "…" : "Accept"}
                      </Button>
                      <Button
                        onClick={() =>
                          void handleInviteResponse(invite, "decline")
                        }
                        disabled={responding}
                        variant="outline"
                        className="bg-white hover:bg-[#FFE4E4] text-[#3D2817] font-semibold border-2 border-[#3D2817]"
                      >
                        <X className="size-4 mr-1" />
                        Decline
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
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
