import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import {
  ArrowLeft,
  LogOut,
  Pause,
  Pencil,
  Play,
  Save,
  X,
} from "lucide-react";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { useSpotify } from "../data/SpotifyContext";
import { useAppUser } from "../data/AppUserContext";
import { usePlayer } from "../data/PlayerContext";
import {
  fetchPlaylist,
  updateAnnotation,
  type AppPlaylistDetail,
  type AppPlaylistSong,
} from "../data/appPlaylistsApi";
import { formatError } from "../data/formatError";

// =============================================================================
// AppSongView — single-track view for SpinDeck-built playlists.
// =============================================================================
// Mirrors the Spotify-side SongView visually (big art, title, play) but the
// "description" block here is the playlist owner's annotation — a single
// description, not a comment feed. Owners get an inline edit affordance so
// they can tweak the note from this page; viewers see it read-only.
//
// Public route: anonymous viewers can land here from a shared playlist
// link, just like /app-playlist/:playlistId.
// =============================================================================

export function AppSongView() {
  const { playlistId, songId } = useParams();
  const navigate = useNavigate();
  const { user, signOut } = useAppUser();
  const { isConnected } = useSpotify();
  const { play, isReady, isPlaying, currentTrack, togglePlayPause } = usePlayer();

  const [detail, setDetail] = useState<AppPlaylistDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!playlistId) return;
    setLoading(true);
    setError(null);
    fetchPlaylist(playlistId)
      .then(setDetail)
      .catch((e) => setError(formatError(e, "Couldn't load song.")))
      .finally(() => setLoading(false));
  }, [playlistId]);

  // Find the requested song in the loaded playlist. We key by track id (the
  // Spotify id) rather than position so a stable URL survives re-orders.
  const entry: AppPlaylistSong | null = useMemo(() => {
    if (!detail || !songId) return null;
    return detail.songs.find((s) => s.trackId === songId) ?? null;
  }, [detail, songId]);

  const isOwner = !!(user?.id && detail && detail.ownerId === user.id);

  // ---- Inline annotation editor (owner-only) ------------------------------
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Reset the draft whenever the underlying annotation changes (load,
  // remote update, etc.) so opening the editor always starts from the
  // current saved value.
  useEffect(() => {
    setDraft(entry?.annotation ?? "");
  }, [entry?.annotation]);

  async function handleSaveAnnotation() {
    if (!detail || !entry) return;
    setSaving(true);
    setSaveError(null);
    try {
      await updateAnnotation({
        playlistId: detail.id,
        position: entry.position,
        annotation: draft,
      });
      // Patch the loaded detail so the read view shows the new value
      // without a full refetch (which would flicker).
      const cleaned = draft.trim();
      const nextAnnotation = cleaned.length > 0 ? cleaned : null;
      setDetail((prev) =>
        prev
          ? {
              ...prev,
              songs: prev.songs.map((s) =>
                s.position === entry.position
                  ? { ...s, annotation: nextAnnotation }
                  : s
              ),
            }
          : prev
      );
      setEditing(false);
    } catch (e) {
      setSaveError(formatError(e, "Couldn't save description."));
    } finally {
      setSaving(false);
    }
  }

  // ---- Render --------------------------------------------------------------

  if (loading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-[#FFF8E7]">
        <p className="text-[#8B6F47]">Loading song…</p>
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-[#FFF8E7] p-8">
        <div className="max-w-md text-center space-y-3">
          <h1 className="text-2xl font-bold text-[#3D2817]">Couldn't load song</h1>
          <p className="text-[#8B6F47]">{error ?? "Unknown error."}</p>
          <Button onClick={() => navigate("/home")} variant="outline">
            Back to Home
          </Button>
        </div>
      </div>
    );
  }

  if (!entry) {
    // The playlist loaded but the URL points to a track that's not in it.
    // Could happen if the owner removed the track between page loads.
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-[#FFF8E7] p-8">
        <div className="max-w-md text-center space-y-3">
          <h1 className="text-2xl font-bold text-[#3D2817]">Track not found</h1>
          <p className="text-[#8B6F47]">
            This song isn't in the playlist anymore.
          </p>
          <Button
            onClick={() => navigate(`/app-playlist/${detail.id}`)}
            variant="outline"
          >
            Back to playlist
          </Button>
        </div>
      </div>
    );
  }

  const song = entry.song;
  const isThisTrack = currentTrack?.id === song.id;

  return (
    <div className="min-h-screen w-full bg-[#FFF8E7] pb-24">
      <header className="border-b-2 border-[#3D2817] bg-[#FFE8BA] sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 sm:px-8 py-3 sm:py-4 flex items-center justify-between gap-2">
          <Button
            variant="ghost"
            onClick={() => navigate(`/app-playlist/${detail.id}`)}
            className="text-[#3D2817]"
          >
            <ArrowLeft className="size-5 mr-2" />
            Back to playlist
          </Button>
          {user && (
            <Button
              variant="ghost"
              onClick={() => void signOut()}
              className="text-[#8B6F47] hover:text-red-600"
            >
              <LogOut className="size-4 mr-2" />
              Log out
            </Button>
          )}
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 sm:px-8 py-6 sm:py-12">
        {/* ----- Track header ----- */}
        <div className="mb-8 sm:mb-12 flex flex-col items-center sm:items-start text-center sm:text-left">
          {song.albumArt ? (
            <div className="mb-4 sm:mb-6">
              <img
                src={song.albumArt}
                alt={song.title}
                className="w-48 h-48 sm:w-64 sm:h-64 object-cover rounded-lg border-4 border-[#3D2817] shadow-[8px_8px_0px_0px_rgba(61,40,23,1)]"
              />
            </div>
          ) : (
            <div className="mb-4 sm:mb-6 w-48 h-48 sm:w-64 sm:h-64 rounded-lg border-4 border-[#3D2817] bg-[#FFE8BA] shadow-[8px_8px_0px_0px_rgba(61,40,23,1)]" />
          )}
          <h1 className="text-2xl sm:text-4xl font-bold mb-2 sm:mb-3 text-[#3D2817] break-words">
            {song.title}
          </h1>
          <p className="text-base sm:text-xl text-[#8B6F47] mb-1">{song.artist}</p>
          {song.album && (
            <p className="text-sm sm:text-base text-[#8B6F47]">{song.album}</p>
          )}
          <div className="mt-3 sm:mt-4 flex items-center gap-4 sm:gap-6 text-sm text-[#8B6F47]">
            {song.duration && <span>{song.duration}</span>}
            {/* Play requires Spotify; viewers without it see no play button
                (same gate as the playlist's Play All). */}
            {isReady && isConnected && (
              <button
                onClick={() => {
                  if (isThisTrack) {
                    togglePlayPause();
                  } else {
                    play({ uris: [`spotify:track:${song.id}`] });
                  }
                }}
                className="p-3 bg-[#FF9F45] text-[#3D2817] rounded-full border-2 border-[#3D2817] shadow-[3px_3px_0px_0px_rgba(61,40,23,1)] hover:shadow-[1px_1px_0px_0px_rgba(61,40,23,1)] hover:scale-105 transition-all"
                aria-label={isPlaying && isThisTrack ? "Pause" : "Play"}
              >
                {isPlaying && isThisTrack ? (
                  <Pause className="size-5" />
                ) : (
                  <Play className="size-5 ml-0.5" />
                )}
              </button>
            )}
          </div>
        </div>

        {/* ----- Description (the playlist owner's annotation) ----- */}
        <div>
          <div className="flex items-center justify-between mb-3 sm:mb-4">
            <h2 className="text-xl sm:text-2xl font-bold text-[#3D2817]">
              Description
              {detail.ownerUsername && (
                <span className="ml-2 text-sm font-normal text-[#8B6F47]">
                  by{" "}
                  <span className="font-semibold text-[#3D2817]">
                    @{detail.ownerUsername}
                  </span>
                </span>
              )}
            </h2>
            {isOwner && !editing && (
              <Button
                variant="secondary"
                onClick={() => setEditing(true)}
              >
                <Pencil className="size-4 mr-2" />
                {entry.annotation ? "Edit" : "Add description"}
              </Button>
            )}
          </div>

          {editing ? (
            <div className="space-y-3 border-2 border-[#3D2817] rounded-lg p-4 sm:p-5 bg-white shadow-[4px_4px_0px_0px_rgba(61,40,23,1)]">
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={5}
                maxLength={2000}
                placeholder="Why this song? Liner-notes style — what's the story?"
                className="bg-[#FFF8E7]"
              />
              {saveError && (
                <p className="text-sm text-red-700 bg-red-50 border border-red-300 rounded px-3 py-2">
                  {saveError}
                </p>
              )}
              <div className="flex items-center gap-2">
                <Button
                  onClick={() => void handleSaveAnnotation()}
                  disabled={saving}
                  className="bg-[#FF9F45] hover:bg-[#FF8C2E] text-[#3D2817] font-semibold border-2 border-[#3D2817] shadow-[4px_4px_0px_0px_rgba(61,40,23,1)] hover:shadow-[2px_2px_0px_0px_rgba(61,40,23,1)] transition-all"
                >
                  <Save className="size-4 mr-2" />
                  {saving ? "Saving…" : "Save"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setDraft(entry.annotation ?? "");
                    setEditing(false);
                    setSaveError(null);
                  }}
                  disabled={saving}
                >
                  <X className="size-4 mr-2" />
                  Cancel
                </Button>
              </div>
            </div>
          ) : entry.annotation ? (
            // Single description block — same blockquote treatment as the
            // inline annotation in AppPlaylistView, just at full width.
            <blockquote className="border-l-4 border-[#FF9F45] pl-4 sm:pl-5 py-3 text-base sm:text-lg text-[#3D2817] whitespace-pre-wrap bg-white rounded-r-lg border-y-2 border-r-2 border-[#3D2817] shadow-[4px_4px_0px_0px_rgba(61,40,23,0.3)]">
              {entry.annotation}
            </blockquote>
          ) : (
            <div className="border-2 border-dashed border-[#8B6F47] rounded-lg p-6 sm:p-8 text-center text-[#8B6F47] bg-white/50">
              {isOwner ? (
                <p>
                  No description yet. Tell viewers why this track earned its
                  spot — tap{" "}
                  <span className="font-semibold">Add description</span>{" "}
                  above.
                </p>
              ) : (
                <p>
                  {detail.ownerUsername
                    ? `@${detail.ownerUsername} hasn't added a description for this track yet.`
                    : "No description yet."}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
