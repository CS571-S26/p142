import { useEffect, useMemo, useRef, useState } from "react";
import { Crosshair, Save, Trash2, X } from "lucide-react";
import { Button } from "./button";

// =============================================================================
// FavoritePartEditor — pick a (start_ms, end_ms) range inside a track.
// =============================================================================
// Three input methods, all editing the same value:
//
//   1. Range slider — two native <input type="range"> sliders stacked over
//      a track-length bar. Visual + drag-to-pick.
//   2. mm:ss inputs — text fields for fine-tuning. Parses "M:SS" or "MM:SS",
//      tolerates plain seconds.
//   3. "Use current position" buttons — only enabled while the host track
//      is actually playing (the parent passes `currentPositionMs` only when
//      that's the case).
//
// Saves are explicit: nothing persists until the user clicks Save. Clear
// removes the favorite-part entirely (the parent handles deletion).
// =============================================================================

export interface FavoritePartValue {
  startMs: number;
  endMs: number;
}

interface Props {
  durationMs: number;
  /** Initial value. null = no favorite part yet (editor opens empty). */
  initial: FavoritePartValue | null;
  /** Current playback position, in ms — only passed when this track is
   * the one actually playing. When provided, the "Use current position"
   * buttons are enabled. */
  currentPositionMs?: number;
  /** Whether the parent is currently saving (disables submit). */
  saving?: boolean;
  /** Save handler. Receives the validated value. */
  onSave: (value: FavoritePartValue) => void | Promise<void>;
  /** Clear (delete) handler. Only renders the Clear button when this
   * AND `initial` are both provided. */
  onClear?: () => void | Promise<void>;
  /** Cancel handler — close without saving. */
  onCancel: () => void;
}

// ---------------------------------------------------------------------------
// mm:ss formatting + parsing
// ---------------------------------------------------------------------------

function formatMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "0:00";
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// Accepts "M:SS", "MM:SS", "M:S", or a bare integer second count.
// Returns null on unparseable input. We deliberately don't try to be
// clever about decimals — favorite parts at second-precision are fine.
function parseMmSs(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (trimmed.includes(":")) {
    const [mPart, sPart] = trimmed.split(":");
    const m = Number(mPart);
    const s = Number(sPart);
    if (!Number.isFinite(m) || !Number.isFinite(s)) return null;
    if (m < 0 || s < 0 || s >= 60) return null;
    return Math.round((m * 60 + s) * 1000);
  }

  const onlySeconds = Number(trimmed);
  if (!Number.isFinite(onlySeconds) || onlySeconds < 0) return null;
  return Math.round(onlySeconds * 1000);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FavoritePartEditor({
  durationMs,
  initial,
  currentPositionMs,
  saving = false,
  onSave,
  onClear,
  onCancel,
}: Props) {
  // Default to the FULL track when nothing is set yet — both handles
  // are visible at the edges and the user adjusts inward from there.
  const defaultStart = 0;
  const defaultEnd = durationMs;

  const [startMs, setStartMs] = useState<number>(
    initial?.startMs ?? defaultStart
  );
  const [endMs, setEndMs] = useState<number>(initial?.endMs ?? defaultEnd);

  // Mm:ss text-field drafts. Tracked separately so the user can be in
  // the middle of typing "1:" without us thrashing the numeric state.
  const [startDraft, setStartDraft] = useState(formatMs(startMs));
  const [endDraft, setEndDraft] = useState(formatMs(endMs));
  const [draftError, setDraftError] = useState<string | null>(null);

  // Whenever the numeric state changes (slider drag, "Use current"
  // button), reflect it back into the text drafts so the two stay in
  // sync. The reverse direction (text -> numeric) is handled in the
  // input's blur handler.
  useEffect(() => {
    setStartDraft(formatMs(startMs));
  }, [startMs]);
  useEffect(() => {
    setEndDraft(formatMs(endMs));
  }, [endMs]);

  // Form-level validity. The handlers below already prevent invalid
  // intermediate states (start crossing end, etc.), so this is just
  // the final guard for the Save button.
  const isValid = useMemo(() => {
    if (!Number.isFinite(durationMs) || durationMs <= 0) return false;
    if (startMs < 0 || endMs <= startMs) return false;
    if (endMs > durationMs) return false;
    return true;
  }, [startMs, endMs, durationMs]);

  // ---- Slider handlers --------------------------------------------------
  // Each handler clamps against the other handle with a 1s minimum gap
  // so the band stays visible and the start/end can never cross.
  const MIN_GAP_MS = 1_000;

  function handleStartSlider(next: number) {
    const clamped = Math.max(0, Math.min(next, endMs - MIN_GAP_MS));
    setStartMs(clamped);
  }
  function handleEndSlider(next: number) {
    const clamped = Math.min(durationMs, Math.max(next, startMs + MIN_GAP_MS));
    setEndMs(clamped);
  }

  // ---- Pointer-driven slider --------------------------------------------
  // The earlier implementation stacked two native <input type="range">
  // elements at the same position. Whichever one rendered last sat on
  // top, so every click landed on the end handle and the start handle
  // was effectively unclickable. Custom pointer handling fixes that:
  // pointerdown picks whichever handle is closer to the click and
  // drags THAT one. Keyboard accessibility stays via the role="slider"
  // thumbs below (←/→ arrow keys, Home/End jumps).
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef<"start" | "end" | null>(null);
  // Most recent handle interacted with — controls the visible "raised"
  // styling so the user can tell which handle their keyboard arrows
  // will affect.
  const [activeHandle, setActiveHandle] = useState<"start" | "end">("end");

  function pointerToMs(clientX: number): number | null {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return null;
    const ratio = (clientX - rect.left) / rect.width;
    const clamped = Math.max(0, Math.min(1, ratio));
    // Round to an integer ms — the DB columns are INTEGER and Postgres
    // rejects float values with `invalid input syntax for type integer`.
    // Rounding here keeps the rest of the editor's state clean too.
    return Math.round(clamped * durationMs);
  }

  function applyAt(ms: number, which: "start" | "end") {
    if (which === "start") handleStartSlider(ms);
    else handleEndSlider(ms);
  }

  function onTrackPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    // Only react to primary button (left click / first finger).
    if (e.button !== 0 && e.pointerType === "mouse") return;
    const clickMs = pointerToMs(e.clientX);
    if (clickMs == null) return;
    // Pick the closer handle. On a tie (rare — exact midpoint), prefer
    // the start so the user can grab it from the left edge of the band.
    const distStart = Math.abs(clickMs - startMs);
    const distEnd = Math.abs(clickMs - endMs);
    const which: "start" | "end" = distStart <= distEnd ? "start" : "end";
    draggingRef.current = which;
    setActiveHandle(which);
    e.currentTarget.setPointerCapture(e.pointerId);
    applyAt(clickMs, which);
  }

  function onTrackPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return;
    const ms = pointerToMs(e.clientX);
    if (ms == null) return;
    applyAt(ms, draggingRef.current);
  }

  function endDrag(e: React.PointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return;
    draggingRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }

  // ---- Keyboard handlers for the thumbs ---------------------------------
  // Matches NowPlayingBar's progress-slider contract: ←/→ adjust by 1s
  // (Shift+arrow = 5s), Home / End jump to the bounds. Each thumb is its
  // own role="slider" so screen readers report start and end separately.
  function makeThumbKeyHandler(which: "start" | "end") {
    return (e: React.KeyboardEvent<HTMLDivElement>) => {
      const small = 1_000;
      const big = 5_000;
      const step = e.shiftKey ? big : small;
      const cur = which === "start" ? startMs : endMs;
      let next: number | null = null;
      if (e.key === "ArrowRight" || e.key === "ArrowUp") next = cur + step;
      else if (e.key === "ArrowLeft" || e.key === "ArrowDown") next = cur - step;
      else if (e.key === "Home") next = 0;
      else if (e.key === "End") next = durationMs;
      else if (e.key === "PageUp") next = cur + big;
      else if (e.key === "PageDown") next = cur - big;
      if (next === null) return;
      e.preventDefault();
      setActiveHandle(which);
      applyAt(next, which);
    };
  }

  // ---- Text input handlers ---------------------------------------------
  // Commit on blur (or Enter). Bad input restores the last-known-good
  // value and surfaces a small inline error.
  function commitStartDraft() {
    const parsed = parseMmSs(startDraft);
    if (parsed === null) {
      setDraftError("Use mm:ss or seconds (e.g. 1:23 or 83).");
      setStartDraft(formatMs(startMs));
      return;
    }
    if (parsed < 0 || parsed > durationMs) {
      setDraftError(`Out of range — track is ${formatMs(durationMs)}.`);
      setStartDraft(formatMs(startMs));
      return;
    }
    if (parsed >= endMs) {
      setDraftError("Start must come before end.");
      setStartDraft(formatMs(startMs));
      return;
    }
    setDraftError(null);
    setStartMs(parsed);
  }
  function commitEndDraft() {
    const parsed = parseMmSs(endDraft);
    if (parsed === null) {
      setDraftError("Use mm:ss or seconds (e.g. 1:23 or 83).");
      setEndDraft(formatMs(endMs));
      return;
    }
    if (parsed < 0 || parsed > durationMs) {
      setDraftError(`Out of range — track is ${formatMs(durationMs)}.`);
      setEndDraft(formatMs(endMs));
      return;
    }
    if (parsed <= startMs) {
      setDraftError("End must come after start.");
      setEndDraft(formatMs(endMs));
      return;
    }
    setDraftError(null);
    setEndMs(parsed);
  }

  // ---- "Use current position" buttons ----------------------------------
  // Only enabled when the parent passes a currentPositionMs (which it
  // only does when this track is the one actually playing).
  const canUseCurrent = typeof currentPositionMs === "number";

  function setStartFromCurrent() {
    if (!canUseCurrent) return;
    const v = Math.max(0, Math.min(currentPositionMs!, endMs - MIN_GAP_MS));
    setStartMs(v);
  }
  function setEndFromCurrent() {
    if (!canUseCurrent) return;
    const v = Math.min(durationMs, Math.max(currentPositionMs!, startMs + MIN_GAP_MS));
    setEndMs(v);
  }

  // ---- Save / Clear ----------------------------------------------------
  async function handleSave() {
    if (!isValid || saving) return;
    await onSave({ startMs, endMs });
  }

  async function handleClear() {
    if (!onClear || saving) return;
    await onClear();
  }

  // ---- Render ----------------------------------------------------------

  // Percentages for the visual band on the slider track.
  const startPct = durationMs > 0 ? (startMs / durationMs) * 100 : 0;
  const endPct = durationMs > 0 ? (endMs / durationMs) * 100 : 0;

  return (
    <div className="space-y-4 border-2 border-[#3D2817] rounded-lg p-4 sm:p-5 bg-white shadow-[4px_4px_0px_0px_rgba(61,40,23,1)]">
      {/* ----- Slider ----- */}
      {/* Custom pointer-driven dual-handle slider. Click anywhere on
          the bar — the closer handle snaps to that position and the
          drag continues on it. Each thumb is independently focusable
          (role="slider") with arrow-key support for keyboard users.
          The earlier stacked-native-inputs implementation broke clicks
          because the second input always sat on top of the first. */}
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold text-[#3D2817]">
          Drag to pick the favorite part
        </legend>
        <div
          ref={trackRef}
          onPointerDown={onTrackPointerDown}
          onPointerMove={onTrackPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          // touch-none disables the browser's swipe-to-scroll gesture
          // while the user drags a thumb on a touch screen.
          className="relative h-8 select-none touch-none cursor-pointer"
        >
          {/* Inactive base track */}
          <div className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 h-1.5 rounded-full bg-[#E6D5B8]" />
          {/* Active range band */}
          <div
            className="pointer-events-none absolute top-1/2 -translate-y-1/2 h-1.5 rounded-full bg-[#FF9F45]"
            style={{
              left: `${startPct}%`,
              width: `${Math.max(0, endPct - startPct)}%`,
            }}
          />
          {/* Start thumb. Visible div + role="slider" for accessibility.
              Pointer events DO fire on the thumb (so a mouse click on
              the thumb gives it focus, useful for keyboard handoff),
              but they bubble up to the track div and the same
              "closer-handle wins" logic decides which handle to drag.
              Either way the track's setPointerCapture takes ownership
              of the rest of the gesture. */}
          <div
            role="slider"
            tabIndex={0}
            aria-label="Favorite part start"
            aria-valuemin={0}
            aria-valuemax={durationMs}
            aria-valuenow={startMs}
            aria-valuetext={formatMs(startMs)}
            onKeyDown={makeThumbKeyHandler("start")}
            onFocus={() => setActiveHandle("start")}
            className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 size-5 rounded-full bg-white border-2 border-[#3D2817] shadow-[2px_2px_0px_0px_rgba(61,40,23,1)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FF9F45] focus-visible:ring-offset-2 focus-visible:ring-offset-white ${
              activeHandle === "start" ? "z-20 scale-110" : "z-10"
            } transition-transform`}
            style={{ left: `${startPct}%` }}
          />
          {/* End thumb. Filled orange so users can tell the handles apart. */}
          <div
            role="slider"
            tabIndex={0}
            aria-label="Favorite part end"
            aria-valuemin={0}
            aria-valuemax={durationMs}
            aria-valuenow={endMs}
            aria-valuetext={formatMs(endMs)}
            onKeyDown={makeThumbKeyHandler("end")}
            onFocus={() => setActiveHandle("end")}
            className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 size-5 rounded-full bg-[#FF9F45] border-2 border-[#3D2817] shadow-[2px_2px_0px_0px_rgba(61,40,23,1)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FF9F45] focus-visible:ring-offset-2 focus-visible:ring-offset-white ${
              activeHandle === "end" ? "z-20 scale-110" : "z-10"
            } transition-transform`}
            style={{ left: `${endPct}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-xs text-[#785A38] tabular-nums">
          <span>0:00</span>
          <span>{formatMs(durationMs)}</span>
        </div>
      </fieldset>

      {/* ----- mm:ss inputs + Use-current buttons ----- */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label
            htmlFor="favpart-start"
            className="block text-xs font-semibold text-[#3D2817] mb-1"
          >
            Start
          </label>
          <div className="flex gap-2">
            <input
              id="favpart-start"
              type="text"
              inputMode="numeric"
              value={startDraft}
              onChange={(e) => setStartDraft(e.target.value)}
              onBlur={commitStartDraft}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitStartDraft();
                }
              }}
              spellCheck={false}
              maxLength={8}
              placeholder="0:00"
              className="w-full rounded-md border-2 border-[#3D2817] px-2 py-1.5 text-sm bg-white text-[#3D2817] tabular-nums focus:outline-none focus:ring-2 focus:ring-[#FF9F45]"
            />
            <Button
              type="button"
              variant="outline"
              onClick={setStartFromCurrent}
              disabled={!canUseCurrent}
              title={
                canUseCurrent
                  ? "Set start to current playback position"
                  : "Play this track to use its current position"
              }
              className="px-2"
            >
              <Crosshair className="size-4" />
            </Button>
          </div>
        </div>

        <div>
          <label
            htmlFor="favpart-end"
            className="block text-xs font-semibold text-[#3D2817] mb-1"
          >
            End
          </label>
          <div className="flex gap-2">
            <input
              id="favpart-end"
              type="text"
              inputMode="numeric"
              value={endDraft}
              onChange={(e) => setEndDraft(e.target.value)}
              onBlur={commitEndDraft}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitEndDraft();
                }
              }}
              spellCheck={false}
              maxLength={8}
              placeholder="0:15"
              className="w-full rounded-md border-2 border-[#3D2817] px-2 py-1.5 text-sm bg-white text-[#3D2817] tabular-nums focus:outline-none focus:ring-2 focus:ring-[#FF9F45]"
            />
            <Button
              type="button"
              variant="outline"
              onClick={setEndFromCurrent}
              disabled={!canUseCurrent}
              title={
                canUseCurrent
                  ? "Set end to current playback position"
                  : "Play this track to use its current position"
              }
              className="px-2"
            >
              <Crosshair className="size-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Status / hint line */}
      {draftError ? (
        <p className="text-sm text-red-700 bg-red-50 border border-red-300 rounded px-3 py-2">
          {draftError}
        </p>
      ) : (
        <p className="text-xs text-[#785A38]">
          Range: <span className="tabular-nums font-semibold">{formatMs(startMs)}</span> –{" "}
          <span className="tabular-nums font-semibold">{formatMs(endMs)}</span>
          {canUseCurrent && (
            <span className="ml-2 text-[#3D2817]">
              (now playing — use the crosshair to set from the current spot)
            </span>
          )}
        </p>
      )}

      {/* ----- Action row ----- */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Button
          type="button"
          onClick={() => void handleSave()}
          disabled={!isValid || saving}
          className="bg-[#FF9F45] hover:bg-[#FF8C2E] text-[#3D2817] font-semibold border-2 border-[#3D2817] shadow-[4px_4px_0px_0px_rgba(61,40,23,1)] hover:shadow-[2px_2px_0px_0px_rgba(61,40,23,1)] transition-all"
        >
          <Save className="size-4 mr-2" />
          {saving ? "Saving…" : "Save favorite part"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={saving}
        >
          <X className="size-4 mr-2" />
          Cancel
        </Button>
        {onClear && initial && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => void handleClear()}
            disabled={saving}
            className="ml-auto text-red-700 hover:bg-red-50 hover:text-red-800"
          >
            <Trash2 className="size-4 mr-2" />
            Clear
          </Button>
        )}
      </div>
    </div>
  );
}
