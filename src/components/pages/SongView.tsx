import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { ArrowLeft, Play, Pause, Plus, Send } from "lucide-react";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { useSpotify } from "../data/SpotifyContext";
import { usePlayer } from "../data/PlayerContext";
import { fetchTrack } from "../data/spotifyApi";
import type { Song, Note } from "../data/mockData";
import { mockNotes } from "../data/mockData";

export function SongView() {
  const { playlistId, songId } = useParams();
  const navigate = useNavigate();
  const { token } = useSpotify();
  const { play, isReady, isPlaying, currentTrack, togglePlayPause } = usePlayer();
  const [song, setSong] = useState<Song | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddNote, setShowAddNote] = useState(false);
  const [newNote, setNewNote] = useState("");

  const notes: Note[] = mockNotes[songId || ""] || [];

  useEffect(() => {
    if (!token || !songId) return;
    fetchTrack(token, songId)
      .then(setSong)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token, songId]);

  if (loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-white">
        <p className="text-gray-400 text-lg">Loading song...</p>
      </div>
    );
  }

  if (error || !song) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-white">
        <div className="text-center">
          <h2 className="text-2xl mb-4">{error ?? "Song not found"}</h2>
          <Button onClick={() => navigate("/home")}>
            Go Back Home
          </Button>
        </div>
      </div>
    );
  }

  const handleAddNote = () => {
    if (newNote.trim()) {
      setNewNote("");
      setShowAddNote(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-white pb-24">
      <header className="border-b border-gray-200 bg-white sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-8 py-4">
          <Button 
            variant="ghost" 
            onClick={() => navigate(`/playlist/${playlistId}`)}
          >
            <ArrowLeft className="size-5 mr-2" />
            Back to playlist
          </Button>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-8 py-12">
        <div className="mb-12">
          {song.albumArt && (
            <div className="mb-6">
              <img 
                src={song.albumArt} 
                alt={song.title}
                className="w-64 h-64 object-cover rounded-lg shadow-lg"
              />
            </div>
          )}
          <h1 className="text-4xl font-bold mb-3">{song.title}</h1>
          <p className="text-xl text-gray-600 mb-1">{song.artist}</p>
          <p className="text-gray-500">{song.album}</p>
          <div className="mt-4 flex items-center gap-6 text-sm text-gray-500">
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
                className="p-3 bg-black text-white rounded-full hover:scale-105 transition-transform"
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
              className="w-full bg-black hover:bg-gray-800 text-white"
            >
              <Plus className="size-5 mr-2" />
              Add Note
            </Button>
          </div>
        )}

        {showAddNote && (
          <div className="mb-8 border border-gray-200 rounded-lg p-6 bg-gray-50">
            <h3 className="font-semibold mb-3">Add Your Note</h3>
            <Textarea 
              placeholder="Share your thoughts about this song..."
              value={newNote}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNewNote(e.target.value)}
              className="mb-3 bg-white"
              rows={4}
            />
            <div className="flex gap-2">
              <Button 
                onClick={handleAddNote} 
                className="bg-black hover:bg-gray-800 text-white"
              >
                <Send className="size-4 mr-2" />
                Post
              </Button>
              <Button 
                variant="outline" 
                onClick={() => setShowAddNote(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        <div>
          <h2 className="text-2xl font-bold mb-6">Notes</h2>
          
          {notes.length === 0 ? (
            <div className="border border-gray-200 rounded-lg p-12 text-center text-gray-400">
              <p>No notes yet. Be the first to share your thoughts!</p>
            </div>
          ) : (
            <div className="space-y-4">
              {notes.map((note) => (
                <div 
                  key={note.id} 
                  className="border border-gray-200 rounded-lg p-6 bg-white hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="font-semibold">{note.userName}</p>
                      <p className="text-sm text-gray-500">{note.timestamp}</p>
                    </div>
                    <div className="text-sm text-gray-500">
                      {note.likes} likes
                    </div>
                  </div>
                  <p className="text-gray-700 leading-relaxed">{note.content}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
