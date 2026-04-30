import { Play, Pause, Shuffle, SkipBack, SkipForward } from "lucide-react";
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
    isShuffled,
    togglePlayPause,
    skipNext,
    skipPrev,
    seek,
    toggleShuffle,
  } = usePlayer();

  if (!isReady || !currentTrack) return null;

  const progress = duration > 0 ? (position / duration) * 100 : 0;

  function handleProgressClick(e: React.MouseEvent<HTMLElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    seek(Math.floor(ratio * duration));
  }

  // Keyboard seek: ←/→ scrub by 5s, Home/End jump to start/end. Matches
  // the keyboard contract for `role="slider"` so screen readers know
  // how to drive it. The visual remains the same thin orange progress
  // bar; we just wrap it in a real interactive element so keyboard
  // users can move it too.
  function handleProgressKey(e: React.KeyboardEvent<HTMLElement>) {
    if (!duration) return;
    const STEP = 5000;
    let next: number | null = null;
    if (e.key === "ArrowRight") next = Math.min(position + STEP, duration);
    else if (e.key === "ArrowLeft") next = Math.max(position - STEP, 0);
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = duration;
    if (next !== null) {
      e.preventDefault();
      seek(next);
    }
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-[#3D2817] text-white border-t-2 border-[#2A1B10] shadow-2xl">
      <div
        role="slider"
        tabIndex={0}
        aria-label="Seek track"
        aria-valuemin={0}
        aria-valuemax={duration || 0}
        aria-valuenow={position}
        aria-valuetext={`${formatTime(position)} of ${formatTime(duration)}`}
        onClick={handleProgressClick}
        onKeyDown={handleProgressKey}
        className="h-1 bg-[#2A1B10] cursor-pointer group focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FF9F45] focus-visible:ring-inset"
      >
        <div
          className="h-full bg-[#FF9F45] group-hover:bg-[#FFD699] transition-colors"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="max-w-5xl mx-auto flex items-center gap-2 sm:gap-4 px-3 sm:px-6 py-2 sm:py-3">
        {currentTrack.albumArt && (
          <img
            src={currentTrack.albumArt}
            alt={currentTrack.name}
            className="w-10 h-10 sm:w-12 sm:h-12 rounded border-2 border-[#785A38] object-cover flex-shrink-0"
          />
        )}

        <div className="flex-1 min-w-0 sm:mr-4">
          <p className="text-sm font-semibold truncate">{currentTrack.name}</p>
          <p className="text-xs text-[#E6D5B8] truncate">{currentTrack.artist}</p>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
          {/* Shuffle — toggleable like Spotify's. Orange icon + a small
              dot underneath when active, so the on-state is unmistakable
              at a glance. The button only renders inside the bar, which
              itself only appears when something's playing — so it
              implicitly satisfies "only show when a playlist is
              playing." */}
          <button
            onClick={() => void toggleShuffle()}
            aria-label="Shuffle"
            aria-pressed={isShuffled}
            title={isShuffled ? "Shuffle is on" : "Shuffle is off"}
            className={`relative p-1.5 rounded-full transition-colors flex items-center justify-center ${
              isShuffled
                ? "text-[#FF9F45] hover:bg-[#785A38]"
                : "text-white hover:bg-[#785A38]"
            }`}
          >
            <Shuffle className="size-4" />
            {isShuffled && (
              <span
                aria-hidden="true"
                className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 size-1 rounded-full bg-[#FF9F45]"
              />
            )}
          </button>
          <button
            onClick={skipPrev}
            className="p-1.5 hover:bg-[#785A38] rounded-full transition-colors"
            aria-label="Previous"
          >
            <SkipBack className="size-4" />
          </button>
          <button
            onClick={togglePlayPause}
            className="p-2 bg-[#FF9F45] text-[#3D2817] rounded-full hover:scale-105 transition-transform"
            aria-label={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? (
              <Pause className="size-5" />
            ) : (
              <Play className="size-5 ml-0.5" />
            )}
          </button>
          <button
            onClick={skipNext}
            className="p-1.5 hover:bg-[#785A38] rounded-full transition-colors"
            aria-label="Next"
          >
            <SkipForward className="size-4" />
          </button>
        </div>

        {/* Time readout takes ~80px and isn't load-bearing — hide on
            phones where every pixel matters for the controls. */}
        <div className="hidden sm:block text-xs text-[#E6D5B8] tabular-nums flex-shrink-0 ml-4 w-20 text-right">
          {formatTime(position)} / {formatTime(duration)}
        </div>
      </div>
    </div>
  );
}
