import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router";
import {
  ArrowLeft,
  Check,
  LogOut,
  MessageSquare,
  Pencil,
  Play,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "./ui/button";
import { useSpotify } from "../data/SpotifyContext";
import { useAppUser } from "../data/AppUserContext";
import { usePlayer } from "../data/PlayerContext";
import {
  addTracksToPlaylist,
  fetchCurrentUser,
  fetchPlaylistDetail,
  removeTracksFromPlaylist,
  searchTracks,
} from "../data/spotifyApi";
import type { PlaylistDetail } from "../data/spotifyApi";
import type { Song } from "../data/mockData";
import { VinylRecord } from "./VinylRecord";

const DEFAULT_COLOR = "#1a1a2e";

export function PlaylistView() {
  const { playlistId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { token } = useSpotify();
  const { signOut } = useAppUser();
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

  // Current user — used to decide whether the playlist is editable
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // --- edit mode ---
  const [isEditing, setIsEditing] = useState(false);
  const [savingAction, setSavingAction] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);

  // --- search (inside edit mode) ---
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Song[]>([]);
  const [searching, setSearching] = useState(false);
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!token || !playlistId) return;
    setLoading(true);
    fetchPlaylistDetail(token, playlistId)
      .then(setDetail)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token, playlistId]);

  useEffect(() => {
    if (!token) return;
    fetchCurrentUser(token)
      .then((u) => setCurrentUserId(u.id))
      .catch(() => setCurrentUserId(null));
  }, [token]);

  const playlistName = detail?.name ?? routeState?.name ?? "Playlist";
  const vinylColor = routeState?.vinylColor ?? DEFAULT_COLOR;
  const songCount = detail?.songCount ?? routeState?.songCount ?? 0;
  const songs = useMemo(() => detail?.songs ?? [], [detail?.songs]);

  // A playlist is editable if it's owned by the current user or collaborative.
  const canEdit = useMemo(() => {
    if (!detail || !currentUserId) return false;
    return detail.ownerId === currentUserId || detail.collaborative;
  }, [detail, currentUserId]);

  const notEditableReason = useMemo(() => {
    if (!detail) return "Loading playlist…";
    if (!currentUserId) return "Couldn't verify your account — try again.";
    if (detail.ownerId && detail.ownerId !== currentUserId && !detail.collaborative) {
      return `Only ${
        detail.ownerName || "the playlist owner"
      } can edit this playlist. Spotify doesn't allow editing playlists you don't own.`;
    }
    return "";
  }, [detail, currentUserId]);

  // Debounced track search while in edit mode
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
    searchDebounce.current = setTimeout(async () => {
      try {
        const results = await searchTracks(token, q, 10);
        setSearchResults(results);
      } catch (e) {
        setEditError(e instanceof Error ? e.message : "Search failed");
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => {
      if (searchDebounce.current) clearTimeout(searchDebounce.current);
    };
  }, [searchQuery, isEditing, token]);

  // IDs already in the playlist — used to dim duplicates in search results
  const existingIds = useMemo(
    () => new Set(songs.map((s) => s.id)),
    [songs]
  );

  async function refreshDetail() {
    if (!token || !playlistId) return;
    const updated = await fetchPlaylistDetail(token, playlistId);
    setDetail(updated);
  }

  async function handleRemove(song: Song) {
    if (!token || !playlistId) return;
    const uri = song.uri ?? `spotify:track:${song.id}`;
    setEditError(null);
    setSavingAction(`remove:${song.id}`);
    try {
      await removeTracksFromPlaylist(token, playlistId, [uri]);
      await refreshDetail();
    } catch (e) {
      setEditError(e instanceof Error ? e.message : "Couldn't remove track");
    } finally {
      setSavingAction(null);
    }
  }

  async function handleAdd(song: Song) {
    if (!token || !playlistId) return;
    const uri = song.uri ?? `spotify:track:${song.id}`;
    setEditError(null);
    setSavingAction(`add:${song.id}`);
    try {
      await addTracksToPlaylist(token, playlistId, [uri]);
      await refreshDetail();
    } catch (e) {
      setEditError(e instanceof Error ? e.message : "Couldn't add track");
    } finally {
      setSavingAction(null);
    }
  }

  function exitEditMode() {
    setIsEditing(false);
    setSearchQuery("");
    setSearchResults([]);
    setEditError(null);
  }

  return (
    <div className="min-h-screen w-full bg-[#FFF8E7] pb-24">
      <header className="border-b-2 border-[#3D2817] bg-[#FFE8BA] sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-8 py-4 flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={() => navigate("/home")}
            className="text-[#3D2817]"
          >
            <ArrowLeft className="size-5 mr-2" />
            Back
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              void signOut();
            }}
            className="text-[#8B6F47] hover:text-red-600"
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
            <h1 className="text-4xl font-bold mb-2 text-[#3D2817]">
              {playlistName}
            </h1>
            <p className="text-sm text-[#8B6F47] mb-4">
              {songCount} songs
              {detail?.ownerName && (
                <span className="ml-2">• by {detail.ownerName}</span>
              )}
            </p>
            <div className="flex items-center gap-3 flex-wrap">
              {isReady && songs.length > 0 && !isEditing && (
                <Button
                  onClick={(e) => {
                    e.stopPropagation();
                    play({ contextUri: `spotify:playlist:${playlistId}` });
                  }}
                  className="bg-[#FF9F45] hover:bg-[#FF8C2E] text-[#3D2817] font-semibold border-2 border-[#3D2817] shadow-[4px_4px_0px_0px_rgba(61,40,23,1)] hover:shadow-[2px_2px_0px_0px_rgba(61,40,23,1)] transition-all"
                >
                  <Play className="size-4 mr-2" />
                  Play All
                </Button>
              )}

              {!isEditing ? (
                <div className="relative group">
                  <Button
                    onClick={() => canEdit && setIsEditing(true)}
                    disabled={!canEdit}
                    aria-disabled={!canEdit}
                    title={canEdit ? "Edit playlist" : notEditableReason}
                    className={
                      canEdit
                        ? "bg-[#FFE8BA] hover:bg-[#F5D99A] text-[#3D2817] font-semibold border-2 border-[#3D2817] shadow-[4px_4px_0px_0px_rgba(61,40,23,1)] hover:shadow-[2px_2px_0px_0px_rgba(61,40,23,1)] transition-all"
                        : "bg-[#E6D5B8] text-[#8B6F47] font-semibold border-2 border-[#B8A080] cursor-not-allowed opacity-70"
                    }
                  >
                    <Pencil className="size-4 mr-2" />
                    Edit
                  </Button>
                  {!canEdit && notEditableReason && (
                    <div className="pointer-events-none absolute left-0 top-full mt-2 w-72 rounded-md border-2 border-[#3D2817] bg-white px-3 py-2 text-xs text-[#3D2817] shadow-[4px_4px_0px_0px_rgba(61,40,23,1)] opacity-0 group-hover:opacity-100 transition-opacity z-20">
                      {notEditableReason}
                    </div>
                  )}
                </div>
              ) : (
                <Button
                  onClick={exitEditMode}
                  className="bg-[#FF9F45] hover:bg-[#FF8C2E] text-[#3D2817] font-semibold border-2 border-[#3D2817] shadow-[4px_4px_0px_0px_rgba(61,40,23,1)] hover:shadow-[2px_2px_0px_0px_rgba(61,40,23,1)] transition-all"
                >
                  <Check className="size-4 mr-2" />
                  Done
                </Button>
              )}
            </div>
          </div>
        </div>

        {isEditing && (
          <div className="mb-6 border-2 border-[#3D2817] rounded-lg bg-white overflow-hidden">
            <div className="px-4 py-2 bg-[#FFE8BA] border-b-2 border-[#3D2817] text-sm font-medium text-[#3D2817] flex items-center gap-2">
              <Plus className="size-4" />
              Add songs
            </div>
            <div className="p-4">
              <div className="flex items-center gap-2 border-2 border-[#3D2817] rounded-md px-3 py-2 bg-[#FFF8E7] focus-within:bg-white">
                <Search className="size-4 text-[#8B6F47]" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search Spotify for songs to add..."
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

              {editError && (
                <p className="mt-3 text-sm text-red-700 bg-red-50 border border-red-300 rounded px-3 py-2">
                  {editError}
                </p>
              )}

              <div className="mt-3">
                {searching ? (
                  <p className="text-sm text-[#8B6F47] px-1 py-2">Searching…</p>
                ) : searchQuery.trim() === "" ? (
                  <p className="text-sm text-[#8B6F47] px-1 py-2">
                    Start typing to find tracks.
                  </p>
                ) : searchResults.length === 0 ? (
                  <p className="text-sm text-[#8B6F47] px-1 py-2">
                    No results for “{searchQuery}”.
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
                              already ? "Already in this playlist" : "Add to playlist"
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
            </div>
          </div>
        )}

        <div className="border-2 border-[#3D2817] rounded-lg overflow-hidden bg-white">
          <div className="px-4 py-2 text-sm text-[#3D2817] font-medium bg-[#FFE8BA] border-b-2 border-[#3D2817]">
            Songs
          </div>

          {loading ? (
            <div className="px-4 py-12 text-center text-[#8B6F47]">
              <p>Loading tracks...</p>
            </div>
          ) : error ? (
            <div className="px-4 py-12 text-center text-[#8B6F47]">
              <p className="font-semibold mb-2 text-[#3D2817]">
                {error.includes("403")
                  ? "This playlist is restricted"
                  : "Something went wrong"}
              </p>
              <p className="text-sm text-[#8B6F47]">
                {error.includes("403")
                  ? "Spotify blocks API access to algorithmic and editorial playlists (Discover Weekly, Daily Mix, etc.). Try one of your own playlists."
                  : error}
              </p>
            </div>
          ) : songs.length === 0 ? (
            <div className="px-4 py-12 text-center text-[#8B6F47]">
              <p>No songs in this playlist yet</p>
            </div>
          ) : (
            songs.map((song, index) => {
              const removing = savingAction === `remove:${song.id}`;
              return (
                <div
                  key={`${song.id}-${index}`}
                  onClick={() =>
                    !isEditing &&
                    navigate(`/playlist/${playlistId}/song/${song.id}`)
                  }
                  className={`px-4 py-4 border-b border-[#E6D5B8] last:border-b-0 group ${
                    isEditing
                      ? ""
                      : "hover:bg-[#FFF8E7] transition-colors cursor-pointer"
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-8 text-[#8B6F47] text-sm text-right relative">
                      <span
                        className={isEditing ? "" : "group-hover:invisible"}
                      >
                        {index + 1}
                      </span>
                      {isReady && !isEditing && (
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
                          <Play className="size-4 text-[#3D2817]" />
                        </button>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3
                        className={`font-semibold text-[#3D2817] ${
                          isEditing ? "" : "group-hover:underline"
                        }`}
                      >
                        {song.title}
                      </h3>
                      <p className="text-sm text-[#8B6F47]">{song.artist}</p>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-[#8B6F47]">
                      <div className="flex items-center gap-1">
                        <MessageSquare className="size-4" />
                        <span>{song.noteCount}</span>
                      </div>
                      <div>{song.duration}</div>
                      {isEditing && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemove(song);
                          }}
                          disabled={removing}
                          title="Remove from playlist"
                          className="p-2 rounded border-2 border-[#3D2817] bg-white hover:bg-red-50 hover:text-red-700 text-[#3D2817] disabled:opacity-50"
                          aria-label={`Remove ${song.title}`}
                        >
                          {removing ? (
                            <span className="text-xs px-1">…</span>
                          ) : (
                            <Trash2 className="size-4" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
