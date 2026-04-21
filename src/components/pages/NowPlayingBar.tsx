import { Play, Pause, SkipBack, SkipForward } from "lucide-react";
import { usePlayer } from "../data/PlayerContext";

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function NowPlayingBar() {
  const {
    isReady,
    isPlaying,
    currentTrack,
    position,
    duration,
    togglePlayPause,
    skipNext,
    skipPrev,
    seek,
  } = usePlayer();

  if (!isReady || !currentTrack) return null;

  const progress = duration > 0 ? (position / duration) * 100 : 0;

  function handleProgressClick(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    seek(Math.floor(ratio * duration));
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-[#3D2817] text-white border-t-2 border-[#2A1B10] shadow-2xl">
      <div
        className="h-1 bg-[#2A1B10] cursor-pointer group"
        onClick={handleProgressClick}
      >
        <div
          className="h-full bg-[#FF9F45] group-hover:bg-[#FFD699] transition-colors"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="max-w-5xl mx-auto flex items-center gap-4 px-6 py-3">
        {currentTrack.albumArt && (
          <img
            src={currentTrack.albumArt}
            alt={currentTrack.name}
            className="w-12 h-12 rounded border-2 border-[#8B6F47] object-cover flex-shrink-0"
          />
        )}

        <div className="flex-1 min-w-0 mr-4">
          <p className="text-sm font-semibold truncate">{currentTrack.name}</p>
          <p className="text-xs text-[#E6D5B8] truncate">{currentTrack.artist}</p>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          <button
            onClick={skipPrev}
            className="p-1.5 hover:bg-[#8B6F47] rounded-full transition-colors"
          >
            <SkipBack className="size-4" />
          </button>
          <button
            onClick={togglePlayPause}
            className="p-2 bg-[#FF9F45] text-[#3D2817] rounded-full hover:scale-105 transition-transform"
          >
            {isPlaying ? (
              <Pause className="size-5" />
            ) : (
              <Play className="size-5 ml-0.5" />
            )}
          </button>
          <button
            onClick={skipNext}
            className="p-1.5 hover:bg-[#8B6F47] rounded-full transition-colors"
          >
            <SkipForward className="size-4" />
          </button>
        </div>

        <div className="text-xs text-[#E6D5B8] tabular-nums flex-shrink-0 ml-4 w-20 text-right">
          {formatTime(position)} / {formatTime(duration)}
        </div>
      </div>
    </div>
  );
}
