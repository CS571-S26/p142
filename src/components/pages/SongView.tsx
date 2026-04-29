import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import {
  ArrowLeft,
  LogOut,
  Pause,
  Pencil,
  Play,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { useSpotify } from "../data/SpotifyContext";
import { usePlayer } from "../data/PlayerContext";
import { useAppUser } from "../data/AppUserContext";
import { fetchTrack } from "../data/spotifyApi";
import type { Song } from "../data/types";
import {
  fetchNotes,
  createNote,
  deleteNote,
  updateNote,
  type NoteWithAuthor,
} from "../data/notesApi";
import { formatError } from "../data/formatError";

// =============================================================================
// SongView — per-song page for Spotify-sourced playlists.
// =============================================================================
// Visually unified with AppSongView: big art header + a single "description"
// block (no multi-author comment feed). The description is the *current
// user's own personal note* about the track — edit-in-place, one per user.
//
// Other users' notes still live in the DB (the notes table is multi-author),
// but we don't surface them here anymore — the comment-style stack felt off
// against the rest of the app's liner-notes aesthetic. If a viewer hasn't
// written one yet they get an empty state inviting them to add theirs.
// =============================================================================

export function SongView() {
  const { playlistId, songId } = useParams();
  const navigate = useNavigate();
  const { token } = useSpotify();
  const { user, signOut } = useAppUser();
  const { play, isReady, isPlaying, currentTrack, togglePlayPause } = usePlayer();

  const [song, setSong] = useState<Song | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Pull every note for this song (multi-author, historical) but only
  // surface the current user's most recent one. The rest of the rows
  // are kept in state as raw data should we ever want to reintroduce a
  // "what others said" view.
  const [notes, setNotes] = useState<NoteWithAuthor[]>([]);
  const [notesLoading, setNotesLoading] = useState(true);
  const [notesError, setNotesError] = useState<string | null>(null);

  // Inline editor state.
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Load track metadata. Requires Spotify; viewers without it can't reach
  // this page (the route is gated behind RequireAuth and the playlist
  // listing only renders for connected users).
  useEffect(() => {
    if (!token || !songId) return;
    fetchTrack(token, songId)
      .then(setSong)
      .catch((e) => setError(formatError(e, "Couldn't load track.")))
      .finally(() => setLoading(false));
  }, [token, songId]);

  // Load notes from Supabase. Sorted desc by created_at server-side, so
  // the first match for the current user is their most recent.
  useEffect(() => {
    if (!songId) return;
    setNotesLoading(true);
    setNotesError(null);
    fetchNotes("song", songId)
      .then(setNotes)
      .catch((e) => setNotesError(formatError(e, "Couldn't load description.")))
      .finally(() => setNotesLoading(false));
  }, [songId]);

  // Personal description = current user's most recent note for this song.
  const myNote: NoteWithAuthor | null = useMemo(() => {
    if (!user?.id) return null;
    return notes.find((n) => n.authorId === user.id) ?? null;
  }, [notes, user?.id]);

  // Reset draft whenever the underlying personal note changes (initial
  // load, save round-trip, etc.).
  useEffect(() => {
    setDraft(myNote?.body ?? "");
  }, [myNote?.body]);

  if (loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-[#FFF8E7]">
        <p className="text-[#8B6F47] text-lg">Loading song…</p>
      </div>
    );
  }

  if (error || !song) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-[#FFF8E7]">
        <div className="text-center">
          <h2 className="text-2xl mb-4 text-[#3D2817]">{error ?? "Song not found"}</h2>
          <Button onClick={() => navigate("/home")}>
            Go Back Home
          </Button>
        </div>
      </div>
    );
  }

  async function handleSave() {
    if (!user || !songId) return;
    const body = draft.trim();
    if (!body) return;
    setSaving(true);
    setSaveError(null);
    try {
      if (myNote) {
        // Edit-in-place — preserves the original created_at + id.
        const updated = await updateNote(myNote.id, body);
        setNotes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
      } else {
        const created = await createNote({
          authorId: user.id,
          targetType: "song",
          targetId: songId,
          body,
        });
        // Prepend so the user's row is first (matches the order from
        // fetchNotes which is desc by created_at).
        setNotes((prev) => [created, ...prev]);
      }
      setEditing(false);
    } catch (e) {
      setSaveError(formatError(e, "Couldn't save description."));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!myNote) return;
    // Optimistic: drop locally, restore on failure.
    const snapshot = notes;
    setNotes((ns) => ns.filter((n) => n.id !== myNote.id));
    setEditing(false);
    try {
      await deleteNote(myNote.id);
    } catch (e) {
      setNotes(snapshot);
      setNotesError(formatError(e, "Couldn't delete description."));
    }
  }

  const isThisTrack = currentTrack?.id === songId;

  return (
    <div className="min-h-screen w-full bg-[#FFF8E7] pb-24">
      <header className="border-b-2 border-[#3D2817] bg-[#FFE8BA] sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 sm:px-8 py-3 sm:py-4 flex items-center justify-between gap-2">
          <Button
            variant="ghost"
            onClick={() => navigate(`/playlist/${playlistId}`)}
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
            {isReady && (
              <button
                onClick={() => {
                  if (isThisTrack) {
                    togglePlayPause();
                  } else {
                    play({ uris: [`spotify:track:${songId}`] });
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

        {/* ----- Personal description ----- */}
        <div>
          <div className="flex items-center justify-between mb-3 sm:mb-4 gap-2 flex-wrap">
            <h2 className="text-xl sm:text-2xl font-bold text-[#3D2817]">
              Your description
            </h2>
            {!editing && user && (
              <div className="flex items-center gap-2">
                <Button variant="secondary" onClick={() => setEditing(true)}>
                  <Pencil className="size-4 mr-2" />
                  {myNote ? "Edit" : "Add description"}
                </Button>
                {myNote && (
                  <Button
                    onClick={() => void handleDelete()}
                    variant="outline"
                    className="bg-white border-2 border-[#3D2817] text-[#8B6F47] hover:text-red-700 hover:bg-red-50"
                    title="Delete your description"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </div>
            )}
          </div>

          {notesLoading ? (
            <div className="border-2 border-[#3D2817] rounded-lg p-6 sm:p-8 text-center text-[#8B6F47] bg-white">
              <p>Loading description…</p>
            </div>
          ) : notesError ? (
            <div className="border-2 border-red-600 rounded-lg p-4 sm:p-6 bg-[#FFE4E4] text-[#3D2817]">
              <p className="font-semibold mb-1">Couldn't load description</p>
              <p className="text-sm">{notesError}</p>
            </div>
          ) : editing ? (
            <div className="space-y-3 border-2 border-[#3D2817] rounded-lg p-4 sm:p-5 bg-white shadow-[4px_4px_0px_0px_rgba(61,40,23,1)]">
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={5}
                maxLength={2000}
                placeholder="What's the story with this track? Write it like a liner note."
                className="bg-[#FFF8E7]"
              />
              {saveError && (
                <p className="text-sm text-red-700 bg-red-50 border border-red-300 rounded px-3 py-2">
                  {saveError}
                </p>
              )}
              <div className="flex items-center gap-2">
                <Button
                  onClick={() => void handleSave()}
                  disabled={saving || !draft.trim()}
                  className="bg-[#FF9F45] hover:bg-[#FF8C2E] text-[#3D2817] font-semibold border-2 border-[#3D2817] shadow-[4px_4px_0px_0px_rgba(61,40,23,1)] hover:shadow-[2px_2px_0px_0px_rgba(61,40,23,1)] transition-all"
                >
                  <Save className="size-4 mr-2" />
                  {saving ? "Saving…" : "Save"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setDraft(myNote?.body ?? "");
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
          ) : myNote ? (
            // Same blockquote treatment as AppPlaylistView's annotation —
            // both kinds of song view now read identically.
            <blockquote className="border-l-4 border-[#FF9F45] pl-4 sm:pl-5 py-3 text-base sm:text-lg text-[#3D2817] whitespace-pre-wrap bg-white rounded-r-lg border-y-2 border-r-2 border-[#3D2817] shadow-[4px_4px_0px_0px_rgba(61,40,23,0.3)]">
              {myNote.body}
            </blockquote>
          ) : (
            <div className="border-2 border-dashed border-[#8B6F47] rounded-lg p-6 sm:p-8 text-center text-[#8B6F47] bg-white/50">
              {user ? (
                <p>
                  No description yet. Tap{" "}
                  <span className="font-semibold">Add description</span>{" "}
                  above to write your own liner-note for this track.
                </p>
              ) : (
                <p>Sign in to add your own description.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
