import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import {
  ArrowLeft,
  Check,
  LogOut,
  Music,
  Pencil,
  Play,
  Plus,
  Save,
  Search,
  Share2,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { useSpotify } from "../data/SpotifyContext";
import { useAppUser } from "../data/AppUserContext";
import { usePlayer } from "../data/PlayerContext";
import {
  addSong,
  fetchPlaylist,
  removeSong,
  updateAnnotation,
  updatePlaylist,
  type AppPlaylistDetail,
  type AppPlaylistSong,
} from "../data/appPlaylistsApi";
import { searchTracks } from "../data/spotifyApi";
import type { Song } from "../data/mockData";
import { VinylRecord } from "./VinylRecord";

// =============================================================================
// AppPlaylistView — single-page view with a View ↔ Edit toggle.
// =============================================================================
// View mode: renders the playlist like a liner-notes page. Each song shows
// the owner's annotation underneath.
// Edit mode (owner only): search Spotify via the public proxy to add tracks,
// remove tracks, and edit each song's annotation inline.
// =============================================================================

export function AppPlaylistView() {
  const { playlistId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, signOut } = useAppUser();
  const { token, isConnected, login } = useSpotify();
  const { play, isReady } = usePlayer();

  const [detail, setDetail] = useState<AppPlaylistDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Owner check drives all edit affordances.
  const isOwner = useMemo(
    () => !!(detail && user?.id && detail.ownerId === user.id),
    [detail, user?.id]
  );

  // URL `?edit=1` starts the page in edit mode — useful for the "just
  // created" flow from HomePage so the user lands straight in the builder.
  const [isEditing, setIsEditing] = useState<boolean>(
    () => searchParams.get("edit") === "1"
  );
  // Once the page has booted in edit mode we clear the query param so
  // refreshing doesn't keep forcing it.
  useEffect(() => {
    if (searchParams.get("edit") === "1") {
      const next = new URLSearchParams(searchParams);
      next.delete("edit");
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadDetail = useCallback(async () => {
    if (!playlistId) return;
    setLoading(true);
    setError(null);
    try {
      const d = await fetchPlaylist(playlistId);
      setDetail(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [playlistId]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  // --- Playlist-level metadata editing (name + description) -----------------
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [savingMeta, setSavingMeta] = useState(false);

  useEffect(() => {
    if (!detail) return;
    setEditName(detail.name);
    setEditDescription(detail.description);
  }, [detail]);

  async function saveMeta() {
    if (!detail) return;
    const nameChanged = editName.trim() !== detail.name;
    const descChanged = editDescription.trim() !== detail.description;
    if (!nameChanged && !descChanged) return;
    setSavingMeta(true);
    try {
      await updatePlaylist(detail.id, {
        name: nameChanged ? editName : undefined,
        description: descChanged ? editDescription : undefined,
      });
      // Local patch — avoid a full refetch (which would flicker the song list).
      setDetail((prev) =>
        prev
          ? {
              ...prev,
              name: editName.trim(),
              description: editDescription.trim(),
            }
          : prev
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingMeta(false);
    }
  }

  // --- Search for songs to add ----------------------------------------------
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Song[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isEditing || !token) return;
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    const q = searchQuery.trim();
    if (!q) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    setSearchError(null);
    searchDebounce.current = setTimeout(async () => {
      try {
        // Use the owner's personal Spotify token: it has full API access
        // even while the Spotify app is in dev-mode.
        const results = await searchTracks(token, q, 10);
        setSearchResults(results);
      } catch (e) {
        setSearchError(e instanceof Error ? e.message : "Search failed");
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => {
      if (searchDebounce.current) clearTimeout(searchDebounce.current);
    };
  }, [searchQuery, isEditing, token]);

  // --- Share link -----------------------------------------------------------
  const [shareStatus, setShareStatus] = useState<"idle" | "copied">("idle");

  async function handleShare() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setShareStatus("copied");
      setTimeout(() => setShareStatus("idle"), 2000);
    } catch {
      // Clipboard API can be blocked in non-HTTPS contexts. Fall back to a
      // manual prompt so the user can still grab the URL.
      window.prompt("Copy this link:", window.location.href);
    }
  }

  // --- Song ops -------------------------------------------------------------
  const [savingAction, setSavingAction] = useState<string | null>(null);

  const existingIds = useMemo(
    () => new Set((detail?.songs ?? []).map((s) => s.trackId)),
    [detail?.songs]
  );

  async function handleAdd(song: Song) {
    if (!detail || !user?.id) return;
    setSavingAction(`add:${song.id}`);
    try {
      // Pass the full Song so title / artist / album / cover / duration
      // get cached on the row. Viewers (Spotify-connected or not) then
      // render annotated playlists with zero external calls.
      const newSong = await addSong({
        playlistId: detail.id,
        song,
        addedBy: user.id,
      });
      setDetail((prev) =>
        prev
          ? {
              ...prev,
              songs: [...prev.songs, newSong],
              songCount: prev.songCount + 1,
            }
          : prev
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingAction(null);
    }
  }

  async function handleRemove(position: number) {
    if (!detail) return;
    setSavingAction(`remove:${position}`);
    try {
      await removeSong({ playlistId: detail.id, position });
      // Local re-pack so the UI stays in sync without a refetch.
      setDetail((prev) => {
        if (!prev) return prev;
        const remaining = prev.songs
          .filter((s) => s.position !== position)
          .map((s) => (s.position > position ? { ...s, position: s.position - 1 } : s));
        return { ...prev, songs: remaining, songCount: remaining.length };
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingAction(null);
    }
  }

  async function handleAnnotationSave(position: number, value: string) {
    if (!detail) return;
    setSavingAction(`annotate:${position}`);
    try {
      await updateAnnotation({
        playlistId: detail.id,
        position,
        annotation: value,
      });
      const clean = value.trim();
      setDetail((prev) =>
        prev
          ? {
              ...prev,
              songs: prev.songs.map((s) =>
                s.position === position
                  ? { ...s, annotation: clean.length > 0 ? clean : null }
                  : s
              ),
            }
          : prev
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingAction(null);
    }
  }

  // --- Render ---------------------------------------------------------------

  if (loading) {
    return (
      <div className="min-h-screen w-full bg-[#FFF8E7] flex items-center justify-center">
        <p className="text-[#8B6F47]">Loading playlist…</p>
      </div>
    );
  }

  if (error && !detail) {
    return (
      <div className="min-h-screen w-full bg-[#FFF8E7] p-8">
        <div className="max-w-xl mx-auto text-center space-y-3 pt-24">
          <h1 className="text-2xl font-bold text-[#3D2817]">
            Couldn't load playlist
          </h1>
          <p className="text-[#8B6F47]">{error}</p>
          <Button onClick={() => navigate("/home")} variant="outline">
            Back to Home
          </Button>
        </div>
      </div>
    );
  }

  if (!detail) return null;

  const songs = detail.songs;

  return (
    <div className="min-h-screen w-full bg-[#FFF8E7] pb-24">
      <header className="border-b-2 border-[#3D2817] bg-[#FFE8BA] sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-8 py-4 flex items-center justify-between">
          {user ? (
            <Button
              variant="ghost"
              onClick={() => navigate("/home")}
              className="text-[#3D2817]"
            >
              <ArrowLeft className="size-5 mr-2" />
              Back
            </Button>
          ) : (
            // Anonymous visitor — show the brand as a subtle home anchor
            // instead of an orphan Back button.
            <button
              onClick={() => navigate("/")}
              className="font-bold text-[#3D2817] hover:underline"
            >
              SpinDeck
            </button>
          )}
          {user ? (
            <Button
              variant="ghost"
              onClick={() => void signOut()}
              className="text-[#8B6F47] hover:text-red-600"
            >
              <LogOut className="size-4 mr-2" />
              Log out
            </Button>
          ) : (
            <Button
              onClick={() => navigate("/")}
              className="bg-[#FF9F45] hover:bg-[#FF8C2E] text-[#3D2817] font-semibold border-2 border-[#3D2817] shadow-[4px_4px_0px_0px_rgba(61,40,23,1)] hover:shadow-[2px_2px_0px_0px_rgba(61,40,23,1)] transition-all"
            >
              Sign up
            </Button>
          )}
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-8 py-12">
        {/* ----- Anonymous-viewer signup CTA ----- */}
        {/* Subtle banner pushing the viewer toward making a SpinDeck
            account so they can build their own annotated playlists.
            Hidden for signed-in users. */}
        {!user && (
          <div className="mb-8 border-2 border-[#3D2817] rounded-md bg-[#FFE8BA] px-4 py-3 flex items-center gap-3 shadow-[3px_3px_0px_0px_rgba(61,40,23,1)]">
            <Music className="size-5 text-[#3D2817] flex-shrink-0" />
            <p className="text-sm text-[#3D2817] flex-1">
              Loving this playlist?{" "}
              <span className="font-semibold">
                Sign up for SpinDeck
              </span>{" "}
              to annotate your own.
            </p>
            <Button
              onClick={() => navigate("/")}
              className="bg-[#FF9F45] hover:bg-[#FF8C2E] text-[#3D2817] font-semibold border-2 border-[#3D2817] flex-shrink-0"
            >
              Sign up
            </Button>
          </div>
        )}

        {/* ----- Playlist header ----- */}
        <div className="flex items-start gap-8 mb-10">
          <div className="flex-shrink-0">
            <VinylRecord color={detail.vinylColor} size={200} />
          </div>
          <div className="flex-1 pt-4 min-w-0">
            {isEditing && isOwner ? (
              <>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onBlur={saveMeta}
                  maxLength={80}
                  placeholder="Playlist name"
                  className="w-full text-4xl font-bold text-[#3D2817] bg-transparent border-b-2 border-[#3D2817]/30 focus:border-[#3D2817] outline-none mb-3 px-0 py-1"
                />
                <Textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  onBlur={saveMeta}
                  rows={2}
                  maxLength={500}
                  placeholder="Describe your playlist…"
                  className="bg-white mb-3"
                />
                {savingMeta && (
                  <p className="text-xs text-[#8B6F47]">Saving…</p>
                )}
              </>
            ) : (
              <>
                <h1 className="text-4xl font-bold mb-2 text-[#3D2817] break-words">
                  {detail.name}
                </h1>
                {detail.description && (
                  <p className="text-[#8B6F47] mb-3 whitespace-pre-wrap">
                    {detail.description}
                  </p>
                )}
              </>
            )}

            <p className="text-sm text-[#8B6F47] mb-4">
              {detail.songCount} {detail.songCount === 1 ? "song" : "songs"}
              {detail.ownerUsername && (
                <span className="ml-2">
                  • by{" "}
                  <span className="font-semibold">
                    @{detail.ownerUsername}
                  </span>
                </span>
              )}
            </p>

            <div className="flex items-center gap-3 flex-wrap">
              {/* Play-all only works when Spotify is connected. For annotated
                  app playlists we play the track URIs directly (we don't
                  have a Spotify playlist URI to hand to the player). */}
              {isReady && isConnected && songs.length > 0 && !isEditing && (
                <Button
                  onClick={() =>
                    play({
                      uris: songs.map(
                        (s) => s.song.uri ?? `spotify:track:${s.trackId}`
                      ),
                    })
                  }
                  className="bg-[#FF9F45] hover:bg-[#FF8C2E] text-[#3D2817] font-semibold border-2 border-[#3D2817] shadow-[4px_4px_0px_0px_rgba(61,40,23,1)] hover:shadow-[2px_2px_0px_0px_rgba(61,40,23,1)] transition-all"
                >
                  <Play className="size-4 mr-2" />
                  Play All
                </Button>
              )}

              {/* Share — visible to everyone (owner, signed-in viewer,
                  anonymous viewer) whenever we're not in edit mode.
                  Copies the current URL to the clipboard. */}
              {!isEditing && (
                <Button
                  onClick={() => void handleShare()}
                  className="bg-[#FFE8BA] hover:bg-[#F5D99A] text-[#3D2817] font-semibold border-2 border-[#3D2817] shadow-[4px_4px_0px_0px_rgba(61,40,23,1)] hover:shadow-[2px_2px_0px_0px_rgba(61,40,23,1)] transition-all"
                >
                  {shareStatus === "copied" ? (
                    <>
                      <Check className="size-4 mr-2" />
                      Link copied
                    </>
                  ) : (
                    <>
                      <Share2 className="size-4 mr-2" />
                      Share
                    </>
                  )}
                </Button>
              )}

              {isOwner &&
                (!isEditing ? (
                  <Button
                    onClick={() => setIsEditing(true)}
                    className="bg-[#FFE8BA] hover:bg-[#F5D99A] text-[#3D2817] font-semibold border-2 border-[#3D2817] shadow-[4px_4px_0px_0px_rgba(61,40,23,1)] hover:shadow-[2px_2px_0px_0px_rgba(61,40,23,1)] transition-all"
                  >
                    <Pencil className="size-4 mr-2" />
                    Edit
                  </Button>
                ) : (
                  <Button
                    onClick={async () => {
                      // Final metadata save on exit, just in case the user
                      // typed something and clicked Done without blurring.
                      await saveMeta();
                      setIsEditing(false);
                      setSearchQuery("");
                      setSearchResults([]);
                    }}
                    className="bg-[#FF9F45] hover:bg-[#FF8C2E] text-[#3D2817] font-semibold border-2 border-[#3D2817] shadow-[4px_4px_0px_0px_rgba(61,40,23,1)] hover:shadow-[2px_2px_0px_0px_rgba(61,40,23,1)] transition-all"
                  >
                    <Check className="size-4 mr-2" />
                    Done
                  </Button>
                ))}
            </div>
          </div>
        </div>

        {/* ----- Search panel (edit mode only, owner only) ----- */}
        {isEditing && isOwner && (
          <div className="mb-8 border-2 border-[#3D2817] rounded-lg bg-white overflow-hidden">
            <div className="px-4 py-2 bg-[#FFE8BA] border-b-2 border-[#3D2817] text-sm font-medium text-[#3D2817] flex items-center gap-2">
              <Plus className="size-4" />
              Add songs
            </div>
            <div className="p-4">
              {!isConnected ? (
                // Spotify's dev-mode API locks Client Credentials out of
                // /search + /tracks, so for now adding songs requires the
                // owner to be signed into Spotify. Viewers don't need it —
                // annotated playlists render from cached metadata.
                <div className="flex items-start gap-3 p-4 border-2 border-[#3D2817] rounded-md bg-[#FFF8E7]">
                  <Music className="size-5 text-[#3D2817] mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="font-semibold text-[#3D2817] mb-1">
                      Connect Spotify to add songs
                    </p>
                    <p className="text-sm text-[#8B6F47] mb-3">
                      We use your Spotify account to look up tracks. Once a
                      song's been added, anyone can view and read your
                      annotations — no Spotify required on their end.
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
              ) : (
              <>
              <div className="flex items-center gap-2 border-2 border-[#3D2817] rounded-md px-3 py-2 bg-[#FFF8E7] focus-within:bg-white">
                <Search className="size-4 text-[#8B6F47]" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search songs by title, artist, album…"
                  className="flex-1 bg-transparent outline-none text-[#3D2817] placeholder:text-[#8B6F47]"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="text-[#8B6F47] hover:text-[#3D2817]"
                    aria-label="Clear search"
                  >
                    <X className="size-4" />
                  </button>
                )}
              </div>

              {searchError && (
                <p className="mt-3 text-sm text-red-700 bg-red-50 border border-red-300 rounded px-3 py-2">
                  {searchError}
                </p>
              )}

              <div className="mt-3">
                {searching ? (
                  <p className="text-sm text-[#8B6F47] px-1 py-2">Searching…</p>
                ) : searchQuery.trim() === "" ? (
                  <p className="text-sm text-[#8B6F47] px-1 py-2">
                    Start typing to find tracks to add.
                  </p>
                ) : searchResults.length === 0 ? (
                  <p className="text-sm text-[#8B6F47] px-1 py-2">
                    No results for "{searchQuery}".
                  </p>
                ) : (
                  <ul className="divide-y divide-[#E6D5B8]">
                    {searchResults.map((song) => {
                      const already = existingIds.has(song.id);
                      const saving = savingAction === `add:${song.id}`;
                      return (
                        <li
                          key={song.id}
                          className="flex items-center gap-3 py-2"
                        >
                          {song.albumArt ? (
                            <img
                              src={song.albumArt}
                              alt=""
                              className="size-10 rounded border border-[#3D2817] object-cover"
                            />
                          ) : (
                            <div className="size-10 rounded border border-[#3D2817] bg-[#FFE8BA]" />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-[#3D2817] truncate">
                              {song.title}
                            </p>
                            <p className="text-sm text-[#8B6F47] truncate">
                              {song.artist}
                            </p>
                          </div>
                          <Button
                            onClick={() => handleAdd(song)}
                            disabled={already || saving}
                            title={
                              already
                                ? "Already in this playlist"
                                : "Add to playlist"
                            }
                            className={
                              already
                                ? "bg-[#E6D5B8] text-[#8B6F47] border-2 border-[#B8A080] cursor-not-allowed"
                                : "bg-[#FF9F45] hover:bg-[#FF8C2E] text-[#3D2817] font-semibold border-2 border-[#3D2817]"
                            }
                          >
                            {already ? (
                              <>
                                <Check className="size-4 mr-1" />
                                Added
                              </>
                            ) : saving ? (
                              "Adding…"
                            ) : (
                              <>
                                <Plus className="size-4 mr-1" />
                                Add
                              </>
                            )}
                          </Button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
              </>
              )}
            </div>
          </div>
        )}

        {/* ----- Songs list ----- */}
        <div className="border-2 border-[#3D2817] rounded-lg overflow-hidden bg-white">
          <div className="px-4 py-2 text-sm text-[#3D2817] font-medium bg-[#FFE8BA] border-b-2 border-[#3D2817] flex items-center justify-between">
            <span>Songs</span>
            {!isEditing && isOwner && (
              <span className="text-xs text-[#8B6F47]">
                Click Edit to add annotations
              </span>
            )}
          </div>

          {songs.length === 0 ? (
            <div className="px-4 py-12 text-center text-[#8B6F47]">
              {isEditing ? (
                <p>Search above to add your first track.</p>
              ) : isOwner ? (
                <p>This playlist is empty. Tap Edit to add songs.</p>
              ) : (
                <p>This playlist is empty.</p>
              )}
            </div>
          ) : (
            songs.map((entry, index) => (
              // Key includes the saved annotation so that when a save
              // completes and the parent re-renders with the new value,
              // the row remounts with fresh local draft state — no
              // setState-in-effect needed to sync.
              <SongRow
                key={`${entry.trackId}-${entry.position}-${entry.annotation ?? ""}`}
                entry={entry}
                index={index}
                isEditing={isEditing && isOwner}
                onRemove={() => handleRemove(entry.position)}
                onSaveAnnotation={(value) =>
                  handleAnnotationSave(entry.position, value)
                }
                saving={savingAction}
                canPlay={isReady && isConnected}
                onPlay={() =>
                  play({
                    uris: songs.map(
                      (s) => s.song.uri ?? `spotify:track:${s.trackId}`
                    ),
                    offsetIndex: index,
                  })
                }
              />
            ))
          )}
        </div>

        {error && detail && (
          <p className="mt-4 text-sm text-red-700 bg-red-50 border border-red-300 rounded px-3 py-2">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// SongRow — extracted to keep local annotation-edit state isolated per row.
// =============================================================================

interface SongRowProps {
  entry: AppPlaylistSong;
  index: number;
  isEditing: boolean;
  onRemove: () => void;
  onSaveAnnotation: (value: string) => Promise<void> | void;
  saving: string | null;
  canPlay: boolean;
  onPlay: () => void;
}

function SongRow({
  entry,
  index,
  isEditing,
  onRemove,
  onSaveAnnotation,
  saving,
  canPlay,
  onPlay,
}: SongRowProps) {
  // Local draft of the annotation being edited. The parent re-keys this
  // component on `entry.annotation`, so when a save completes the row
  // remounts with this initial value — no sync-effect required.
  const [draft, setDraft] = useState(entry.annotation ?? "");
  const [dirty, setDirty] = useState(false);

  const isRemoving = saving === `remove:${entry.position}`;
  const isAnnotating = saving === `annotate:${entry.position}`;

  return (
    <div className="px-4 py-4 border-b border-[#E6D5B8] last:border-b-0 group">
      <div className="flex items-start gap-4">
        <div className="w-8 pt-1 text-[#8B6F47] text-sm text-right relative">
          <span className={isEditing ? "" : "group-hover:invisible"}>
            {index + 1}
          </span>
          {canPlay && !isEditing && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onPlay();
              }}
              className="absolute inset-0 flex items-start justify-center invisible group-hover:visible pt-1"
              aria-label="Play song"
            >
              <Play className="size-4 text-[#3D2817]" />
            </button>
          )}
        </div>

        {entry.song.albumArt ? (
          <img
            src={entry.song.albumArt}
            alt=""
            className="size-12 rounded border border-[#3D2817] object-cover flex-shrink-0"
          />
        ) : (
          <div className="size-12 rounded border border-[#3D2817] bg-[#FFE8BA] flex-shrink-0" />
        )}

        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-[#3D2817] truncate">
            {entry.song.title}
          </h3>
          <p className="text-sm text-[#8B6F47] truncate">
            {entry.song.artist}
          </p>
        </div>

        <div className="flex items-center gap-4 text-sm text-[#8B6F47] pt-1">
          {entry.song.duration && <div>{entry.song.duration}</div>}
          {isEditing && (
            <button
              onClick={onRemove}
              disabled={isRemoving}
              title="Remove from playlist"
              className="p-2 rounded border-2 border-[#3D2817] bg-white hover:bg-red-50 hover:text-red-700 text-[#3D2817] disabled:opacity-50"
              aria-label={`Remove ${entry.song.title}`}
            >
              {isRemoving ? (
                <span className="text-xs px-1">…</span>
              ) : (
                <Trash2 className="size-4" />
              )}
            </button>
          )}
        </div>
      </div>

      {/* ---- Annotation block ---- */}
      <div className="mt-3 pl-[4.5rem]">
        {isEditing ? (
          <div className="space-y-2">
            <Textarea
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                setDirty(true);
              }}
              maxLength={2000}
              rows={2}
              placeholder="Why this song? (optional)"
              className="bg-[#FFF8E7]"
            />
            <div className="flex items-center gap-2">
              <Button
                type="button"
                onClick={async () => {
                  await onSaveAnnotation(draft);
                  setDirty(false);
                }}
                disabled={!dirty || isAnnotating}
                className="bg-[#3D2817] text-white hover:bg-[#2A1B10] border-2 border-[#3D2817] text-xs px-3 py-1"
              >
                <Save className="size-3 mr-1" />
                {isAnnotating ? "Saving…" : "Save note"}
              </Button>
              {dirty && (
                <button
                  type="button"
                  onClick={() => {
                    setDraft(entry.annotation ?? "");
                    setDirty(false);
                  }}
                  className="text-xs text-[#8B6F47] hover:text-[#3D2817] underline"
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        ) : entry.annotation ? (
          <blockquote className="border-l-4 border-[#FF9F45] pl-3 py-1 text-sm text-[#3D2817] whitespace-pre-wrap bg-[#FFF8E7] rounded-r">
            {entry.annotation}
          </blockquote>
        ) : null}
      </div>
    </div>
  );
}
