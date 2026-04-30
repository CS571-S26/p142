import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { VinylRecord } from "./VinylRecord";
import { VINYL_COLORS, createPlaylist } from "../data/appPlaylistsApi";
import type { AppPlaylistSummary } from "../data/appPlaylistsApi";

interface Props {
  ownerId: string;
  onClose: () => void;
  onCreated: (playlist: AppPlaylistSummary) => void;
}

// Lightweight modal — no shadcn Dialog primitive available, so we hand-roll
// an overlay + card with the same cream/brown aesthetic as the rest of the
// app. Escape closes, click outside closes, Enter on name submits.
export function CreatePlaylistModal({ ownerId, onClose, onCreated }: Props) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(VINYL_COLORS[0]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameRef = useRef<HTMLInputElement>(null);

  // Autofocus on mount.
  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  // Escape-to-close.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !submitting) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, submitting]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const playlist = await createPlaylist({
        ownerId,
        name,
        description,
        vinylColor: color,
        // All playlists are link-shareable for now. The is_public column
        // still exists on the DB (defaults to true), but there's no longer
        // a UI knob to flip it.
        isPublic: true,
      });
      onCreated(playlist);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create playlist.");
      setSubmitting(false);
    }
  }

  return (
    // The dim backdrop is its own focusable <button> rather than an
    // onClick'ed <div>: it gives keyboard users an explicit "Close
    // dialog" target, satisfies the click-events-have-key-events rule,
    // and avoids painting non-interactive divs with mouse handlers.
    // The dialog itself is a sibling, so a click on the backdrop never
    // bubbles through the form (no need for stopPropagation tricks).
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8">
      <button
        type="button"
        onClick={() => {
          if (!submitting) onClose();
        }}
        disabled={submitting}
        aria-label="Close dialog"
        className="absolute inset-0 bg-[#3D2817]/40 backdrop-blur-sm cursor-default focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FF9F45] focus-visible:ring-inset"
      />
      <form
        onSubmit={handleSubmit}
        role="dialog"
        aria-modal="true"
        aria-label="Create playlist"
        className="relative w-full max-w-lg bg-[#FFF8E7] border-2 border-[#3D2817] rounded-lg shadow-[6px_6px_0px_0px_rgba(61,40,23,1)] overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-3 bg-[#FFE8BA] border-b-2 border-[#3D2817]">
          <h2 className="text-lg font-bold text-[#3D2817]">New playlist</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label="Close"
            className="text-[#785A38] hover:text-[#3D2817] disabled:opacity-50"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="px-4 sm:px-5 py-4 sm:py-5 space-y-4 sm:space-y-5">
          <div className="flex flex-col sm:flex-row items-center sm:items-center gap-3 sm:gap-4">
            <div className="flex-shrink-0">
              <VinylRecord color={color} size={80} />
            </div>
            <div className="flex-1 w-full">
              <label
                htmlFor="create-playlist-name"
                className="block text-sm font-semibold text-[#3D2817] mb-1"
              >
                Name
              </label>
              <input
                id="create-playlist-name"
                ref={nameRef}
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
                placeholder="My annotated playlist"
                className="w-full rounded-md border-2 border-[#3D2817] px-3 py-2 bg-white text-[#3D2817] placeholder:text-[#785A38] focus:outline-none focus:ring-2 focus:ring-[#FF9F45]"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="create-playlist-description"
              className="block text-sm font-semibold text-[#3D2817] mb-1"
            >
              Description{" "}
              <span className="font-normal text-[#785A38]">(optional)</span>
            </label>
            <Textarea
              id="create-playlist-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder="What's this playlist about?"
              className="bg-white"
            />
          </div>

          <div>
            {/* Color swatches are a custom radio-style picker. <fieldset>
                + <legend> groups them so screen readers announce "Vinyl
                color" once for the whole group; aria-pressed on each
                button conveys the selected state. */}
            <fieldset>
              <legend className="block text-sm font-semibold text-[#3D2817] mb-2">
                Vinyl color
              </legend>
              <div className="flex flex-wrap gap-2">
                {VINYL_COLORS.map((c) => {
                  const selected = c === color;
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColor(c)}
                      aria-label={`Pick color ${c}`}
                      aria-pressed={selected}
                      className={`size-8 rounded-full border-2 transition-transform ${
                        selected
                          ? "border-[#3D2817] scale-110 shadow-[2px_2px_0px_0px_rgba(61,40,23,1)]"
                          : "border-[#785A38]/40 hover:scale-105"
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  );
                })}
              </div>
            </fieldset>
          </div>

          <p className="text-xs text-[#785A38]">
            Anyone with the link can view this playlist and read your annotations.
          </p>

          {error && (
            <p className="text-sm text-red-700 bg-red-50 border border-red-300 rounded px-3 py-2">
              {error}
            </p>
          )}
        </div>

        <div className="px-5 py-3 border-t-2 border-[#3D2817] bg-[#FFE8BA] flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={submitting || !name.trim()}
            className="bg-[#FF9F45] hover:bg-[#FF8C2E] text-[#3D2817] font-semibold border-2 border-[#3D2817] shadow-[4px_4px_0px_0px_rgba(61,40,23,1)] hover:shadow-[2px_2px_0px_0px_rgba(61,40,23,1)] transition-all"
          >
            {submitting ? "Creating…" : "Create playlist"}
          </Button>
        </div>
      </form>
    </div>
  );
}
