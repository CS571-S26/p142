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

  const handleAddNote = () => {
    if (newNote.trim()) {
      setNewNote("");
      setShowAddNote(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#FFF8E7] pb-24">
      <header className="border-b-2 border-[#3D2817] bg-[#FFE8BA] sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-8 py-4">
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

      <div className="max-w-3xl mx-auto px-8 py-12">
        <div className="mb-12">
          {song.albumArt && (
            <div className="mb-6">
              <img 
                src={song.albumArt} 
                alt={song.title}
                className="w-64 h-64 object-cover rounded-lg border-4 border-[#3D2817] shadow-[8px_8px_0px_0px_rgba(61,40,23,1)]"
              />
            </div>
          )}
          <h1 className="text-4xl font-bold mb-3 text-[#3D2817]">{song.title}</h1>
          <p className="text-xl text-[#8B6F47] mb-1">{song.artist}</p>
          <p className="text-[#8B6F47]">{song.album}</p>
          <div className="mt-4 flex items-center gap-6 text-sm text-[#8B6F47]">
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
              className="w-full bg-[#5B9BD5] hover:bg-[#4A8BC4] text-white font-semibold border-2 border-[#3D2817] shadow-[4px_4px_0px_0px_rgba(61,40,23,1)] hover:shadow-[2px_2px_0px_0px_rgba(61,40,23,1)] transition-all"
            >
              <Plus className="size-5 mr-2" />
              Add Note
            </Button>
          </div>
        )}

        {showAddNote && (
          <div className="mb-8 border-2 border-[#3D2817] rounded-lg p-6 bg-white shadow-[4px_4px_0px_0px_rgba(61,40,23,1)]">
            <h3 className="font-semibold mb-3 text-[#3D2817]">Add Your Note</h3>
            <Textarea 
              placeholder="Share your thoughts about this song..."
              value={newNote}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNewNote(e.target.value)}
              className="mb-3 bg-[#FFF8E7]"
              rows={4}
            />
            <div className="flex gap-2">
              <Button 
                onClick={handleAddNote} 
                className="bg-[#FF9F45] hover:bg-[#FF8C2E] text-[#3D2817] font-semibold border-2 border-[#3D2817]"
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
          <h2 className="text-2xl font-bold mb-6 text-[#3D2817]">Notes</h2>
          
          {notes.length === 0 ? (
            <div className="border-2 border-[#3D2817] rounded-lg p-12 text-center text-[#8B6F47] bg-white">
              <p>No notes yet. Be the first to share your thoughts!</p>
            </div>
          ) : (
            <div className="space-y-4">
              {notes.map((note) => (
                <div 
                  key={note.id} 
                  className="border-2 border-[#3D2817] rounded-lg p-6 bg-white shadow-[4px_4px_0px_0px_rgba(61,40,23,0.3)] hover:shadow-[6px_6px_0px_0px_rgba(61,40,23,0.4)] transition-all"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="font-semibold text-[#3D2817]">{note.userName}</p>
                      <p className="text-sm text-[#8B6F47]">{note.timestamp}</p>
                    </div>
                    <div className="text-sm text-[#8B6F47]">
                      {note.likes} likes
                    </div>
                  </div>
                  <p className="text-[#3D2817] leading-relaxed">{note.content}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
