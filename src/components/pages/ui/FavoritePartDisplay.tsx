import { Heart, Pencil, Play } from "lucide-react";
import { Button } from "./button";

// =============================================================================
// FavoritePartDisplay — read-only render of a saved favorite part.
// =============================================================================
// Shows the range as text ("Favorite part: 1:23 – 2:45"), with a jump-to-
// start button when a player is connected. Highlights when current
// playback position is inside the range.
//
// Used by SongView (personal favorite part) and AppSongView (owner-set
// favorite part). Both pass `editable=true` for the user who can change
// it; viewers get the read-only variant.
// =============================================================================

interface Props {
  startMs: number;
  endMs: number;
  /** Current playback position in ms — only when this track is the one
   * actually playing. Used to drive the "now in favorite part" highlight. */
  currentPositionMs?: number;
  /** Jump-to-start handler. Pages pass a callable that calls
   * `seek(startMs)` (and optionally `play(...)` if not currently
   * playing). Omit when no player is connected. */
  onJump?: () => void;
  /** When true, renders an "Edit" button that calls onEdit. */
  editable?: boolean;
  onEdit?: () => void;
  /** Header label override. Defaults to "Favorite part". The personal
   * variant on SongView passes "Your favorite part"; the owner-set
   * variant on AppSongView passes "Owner's favorite part". */
  label?: string;
}

function formatMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "0:00";
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function FavoritePartDisplay({
  startMs,
  endMs,
  currentPositionMs,
  onJump,
  editable = false,
  onEdit,
  label = "Favorite part",
}: Props) {
  // Are we currently inside the range? Only meaningful when the parent
  // passed currentPositionMs (i.e. this track is playing).
  const inside =
    typeof currentPositionMs === "number" &&
    currentPositionMs >= startMs &&
    currentPositionMs <= endMs;

  return (
    <div
      className={`relative flex items-center gap-3 sm:gap-4 rounded-lg border-2 px-4 py-3 transition-colors ${
        inside
          ? "border-[#FF9F45] bg-[#FFF1DA] shadow-[4px_4px_0px_0px_rgba(255,159,69,0.5)]"
          : "border-[#3D2817] bg-white shadow-[4px_4px_0px_0px_rgba(61,40,23,0.3)]"
      }`}
    >
      <div
        className={`flex-shrink-0 size-10 rounded-full flex items-center justify-center border-2 ${
          inside
            ? "bg-[#FF9F45] border-[#3D2817] text-[#3D2817]"
            : "bg-[#FFE8BA] border-[#3D2817] text-[#3D2817]"
        }`}
        aria-hidden="true"
      >
        <Heart className={`size-5 ${inside ? "fill-current" : ""}`} />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-xs text-[#785A38] uppercase tracking-wide font-semibold">
          {label}
          {inside && (
            <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full bg-[#FF9F45] text-[#3D2817] text-[10px] border border-[#3D2817]">
              Now playing
            </span>
          )}
        </p>
        <p className="text-base sm:text-lg font-bold text-[#3D2817] tabular-nums">
          {formatMs(startMs)} <span className="text-[#785A38]">–</span> {formatMs(endMs)}
        </p>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        {onJump && (
          <Button
            type="button"
            variant="secondary"
            onClick={onJump}
            title="Jump to the start of the favorite part"
            aria-label="Jump to favorite part"
          >
            <Play className="size-4 mr-2" />
            Jump
          </Button>
        )}
        {editable && onEdit && (
          <Button
            type="button"
            variant="outline"
            onClick={onEdit}
            aria-label="Edit favorite part"
            title="Edit favorite part"
          >
            <Pencil className="size-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
