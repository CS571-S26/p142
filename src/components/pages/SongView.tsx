import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { ArrowLeft, Play, Pause, Plus, Send, Trash2 } from "lucide-react";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { useSpotify } from "../data/SpotifyContext";
import { usePlayer } from "../data/PlayerContext";
import { useAppUser } from "../data/AppUserContext";
import { fetchTrack } from "../data/spotifyApi";
import type { Song } from "../data/mockData";
import {
  fetchNotes,
  createNote,
  deleteNote,
  timeAgo,
  type NoteWithAuthor,
} from "../data/notesApi";

export function SongView() {
  const { playlistId, songId } = useParams();
  const navigate = useNavigate();
  const { token } = useSpotify();
  const { user } = useAppUser();
  const { play, isReady, isPlaying, currentTrack, togglePlayPause } = usePlayer();

  const [song, setSong] = useState<Song | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [notes, setNotes] = useState<NoteWithAuthor[]>([]);
  const [notesLoading, setNotesLoading] = useState(true);
  const [notesError, setNotesError] = useState<string | null>(null);

  const [showAddNote, setShowAddNote] = useState(false);
  const [newNote, setNewNote] = useState("");
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);

  // Load track metadata. Requires Spotify for now — will later be
  // replaced by the spotify-proxy Edge Function so Public Mode users
  // can see titles/art too.
  useEffect(() => {
    if (!token || !songId) return;
    fetchTrack(token, songId)
      .then(setSong)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [token, songId]);

  // Load notes from Supabase.
  useEffect(() => {
    if (!songId) return;
    setNotesLoading(true);
    setNotesError(null);
    fetchNotes("song", songId)
      .then(setNotes)
      .catch((e) => setNotesError(e instanceof Error ? e.message : String(e)))
      .finally(() => setNotesLoading(false));
  }, [songId]);

  if (loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-[#FFF8E7]">
        <p className="text-[#8B6F47] text-lg">Loading song...</p>
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

  const handleAddNote = async () => {
    if (!user || !songId || !newNote.trim()) return;
    setPosting(true);
    setPostError(null);
    try {
      const created = await createNote({
        authorId: user.id,
        targetType: "song",
        targetId: songId,
        body: newNote,
      });
      // Prepend so the newest note appears at the top (matches the
      // `order created_at desc` we use in fetchNotes).
      setNotes((prev) => [created, ...prev]);
      setNewNote("");
      setShowAddNote(false);
    } catch (e) {
      setPostError(e instanceof Error ? e.message : String(e));
    } finally {
      setPosting(false);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    // Optimistic: drop from UI first, restore if the delete fails.
    const prev = notes;
    setNotes((ns) => ns.filter((n) => n.id !== noteId));
    try {
      await deleteNote(noteId);
    } catch (e) {
      setNotes(prev);
      setNotesError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#FFF8E7] pb-24">
      <header className="border-b-2 border-[#3D2817] bg-[#FFE8BA] sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 sm:px-8 py-3 sm:py-4">
          <Button
            variant="ghost"
            onClick={() => navigate(`/playlist/${playlistId}`)}
            className="text-[#3D2817]"
          >
            <ArrowLeft className="size-5 mr-2" />
            Back to playlist
          </Button>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 sm:px-8 py-6 sm:py-12">
        <div className="mb-8 sm:mb-12 flex flex-col items-center sm:items-start text-center sm:text-left">
          {song.albumArt && (
            <div className="mb-4 sm:mb-6">
              <img
                src={song.albumArt}
                alt={song.title}
                className="w-48 h-48 sm:w-64 sm:h-64 object-cover rounded-lg border-4 border-[#3D2817] shadow-[8px_8px_0px_0px_rgba(61,40,23,1)]"
              />
            </div>
          )}
          <h1 className="text-2xl sm:text-4xl font-bold mb-2 sm:mb-3 text-[#3D2817] break-words">{song.title}</h1>
          <p className="text-base sm:text-xl text-[#8B6F47] mb-1">{song.artist}</p>
          <p className="text-sm sm:text-base text-[#8B6F47]">{song.album}</p>
          <div className="mt-3 sm:mt-4 flex items-center gap-4 sm:gap-6 text-sm text-[#8B6F47]">
            <span>{song.duration}</span>
            {isReady && (
              <button
                onClick={() => {
                  const isThisTrack = currentTrack?.id === songId;
                  if (isThisTrack) {
                    togglePlayPause();
                  } else {
                    play({ uris: [`spotify:track:${songId}`] });
                  }
                }}
                className="p-3 bg-[#FF9F45] text-[#3D2817] rounded-full border-2 border-[#3D2817] shadow-[3px_3px_0px_0px_rgba(61,40,23,1)] hover:shadow-[1px_1px_0px_0px_rgba(61,40,23,1)] hover:scale-105 transition-all"
              >
                {isPlaying && currentTrack?.id === songId ? (
                  <Pause className="size-5" />
                ) : (
                  <Play className="size-5 ml-0.5" />
                )}
              </button>
            )}
          </div>
        </div>

        {!showAddNote && (
          <div className="mb-8">
            <Button
              onClick={() => setShowAddNote(true)}
              disabled={!user}
              className="w-full bg-[#5B9BD5] hover:bg-[#4A8BC4] text-white font-semibold border-2 border-[#3D2817] shadow-[4px_4px_0px_0px_rgba(61,40,23,1)] hover:shadow-[2px_2px_0px_0px_rgba(61,40,23,1)] transition-all disabled:opacity-60"
            >
              <Plus className="size-5 mr-2" />
              Add Note
            </Button>
          </div>
        )}

        {showAddNote && (
          <div className="mb-8 border-2 border-[#3D2817] rounded-lg p-4 sm:p-6 bg-white shadow-[4px_4px_0px_0px_rgba(61,40,23,1)]">
            <h3 className="font-semibold mb-3 text-[#3D2817]">Add Your Note</h3>
            <Textarea
              placeholder="Share your thoughts about this song..."
              value={newNote}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNewNote(e.target.value)}
              className="mb-3 bg-[#FFF8E7]"
              rows={4}
              maxLength={2000}
            />
            {postError && (
              <p className="text-sm text-red-600 mb-3" role="alert">{postError}</p>
            )}
            <div className="flex gap-2">
              <Button
                onClick={handleAddNote}
                disabled={posting || !newNote.trim()}
                className="bg-[#FF9F45] hover:bg-[#FF8C2E] text-[#3D2817] font-semibold border-2 border-[#3D2817] disabled:opacity-60"
              >
                <Send className="size-4 mr-2" />
                {posting ? "Posting…" : "Post"}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setShowAddNote(false);
                  setPostError(null);
                }}
                disabled={posting}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        <div>
          <h2 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6 text-[#3D2817]">Notes</h2>

          {notesLoading ? (
            <div className="border-2 border-[#3D2817] rounded-lg p-8 sm:p-12 text-center text-[#8B6F47] bg-white">
              <p>Loading notes…</p>
            </div>
          ) : notesError ? (
            <div className="border-2 border-red-600 rounded-lg p-4 sm:p-6 bg-[#FFE4E4] text-[#3D2817]">
              <p className="font-semibold mb-1">Couldn't load notes</p>
              <p className="text-sm">{notesError}</p>
            </div>
          ) : notes.length === 0 ? (
            <div className="border-2 border-[#3D2817] rounded-lg p-8 sm:p-12 text-center text-[#8B6F47] bg-white">
              <p>No notes yet. Be the first to share your thoughts!</p>
            </div>
          ) : (
            <div className="space-y-4">
              {notes.map((note) => {
                const isMine = user?.id === note.authorId;
                const displayLabel =
                  note.authorDisplayName && note.authorDisplayName.length > 0
                    ? `${note.authorDisplayName} · @${note.authorUsername}`
                    : `@${note.authorUsername}`;
                return (
                  <div
                    key={note.id}
                    className="border-2 border-[#3D2817] rounded-lg p-4 sm:p-6 bg-white shadow-[4px_4px_0px_0px_rgba(61,40,23,0.3)] hover:shadow-[6px_6px_0px_0px_rgba(61,40,23,0.4)] transition-all"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <p className="font-semibold text-[#3D2817]">{displayLabel}</p>
                        <p className="text-sm text-[#8B6F47]">{timeAgo(note.createdAt)}</p>
                      </div>
                      {isMine && (
                        <button
                          onClick={() => handleDeleteNote(note.id)}
                          aria-label="Delete note"
                          className="text-[#8B6F47] hover:text-red-600 transition-colors p-1"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      )}
                    </div>
                    <p className="text-[#3D2817] leading-relaxed whitespace-pre-wrap">
                      {note.body}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
