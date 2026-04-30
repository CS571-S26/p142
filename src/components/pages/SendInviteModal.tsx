import { useEffect, useRef, useState } from "react";
import { Send, X } from "lucide-react";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import {
  searchUsersByUsername,
  sendInvite,
  type UserSearchResult,
} from "../data/invitesApi";
import { formatError } from "../data/formatError";

interface Props {
  senderId: string;
  playlistId: string;
  playlistName: string;
  onClose: () => void;
  onSent: () => void;
}

// SendInviteModal — addresses an invite to another SpinDeck user by
// @username. We hand-roll the modal (same as CreatePlaylistModal) to
// match the cream/brown aesthetic. Username field is an inline
// autocomplete — debounced search + dropdown with the top matches.
export function SendInviteModal({
  senderId,
  playlistId,
  playlistName,
  onClose,
  onSent,
}: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  // The user we're locked onto — set by clicking a suggestion. Cleared
  // automatically when the user keeps typing, so the suggestion list
  // can re-open.
  const [picked, setPicked] = useState<UserSearchResult | null>(null);

  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const usernameRef = useRef<HTMLInputElement>(null);
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Autofocus on mount so the user can start typing immediately.
  useEffect(() => {
    usernameRef.current?.focus();
  }, []);

  // Escape-to-close.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !submitting) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, submitting]);

  // Debounced username search. Bypassed if we already have a pick that
  // exactly matches the query — saves a needless round trip when the
  // user hits enter to send.
  useEffect(() => {
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    const trimmed = query.trim().replace(/^@/, "");
    if (!trimmed) {
      setResults([]);
      setSearching(false);
      return;
    }
    if (picked && picked.username.toLowerCase() === trimmed.toLowerCase()) {
      // Already locked onto this user — no search needed.
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    searchDebounce.current = setTimeout(async () => {
      try {
        const r = await searchUsersByUsername(trimmed, senderId, 8);
        setResults(r);
      } catch (e) {
        setError(formatError(e, "Search failed."));
      } finally {
        setSearching(false);
      }
    }, 200);
    return () => {
      if (searchDebounce.current) clearTimeout(searchDebounce.current);
    };
  }, [query, picked, senderId]);

  // Resolve which username string to actually send to. If the user
  // clicked a suggestion we trust that exact value; otherwise we trim
  // the @-prefix off whatever they typed.
  const targetUsername = picked
    ? picked.username
    : query.trim().replace(/^@/, "");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    if (!targetUsername) return;
    setError(null);
    setSubmitting(true);
    try {
      await sendInvite({
        senderId,
        recipientUsername: targetUsername,
        playlistId,
        message: message.trim() || null,
      });
      onSent();
    } catch (e) {
      setError(formatError(e, "Couldn't send invite."));
      setSubmitting(false);
    }
  }

  // Don't render the suggestion dropdown when we're locked onto a pick
  // (avoids "Did you mean…" noise after the user already chose).
  const showResults =
    !!query.trim() &&
    (!picked || picked.username.toLowerCase() !== query.trim().replace(/^@/, "").toLowerCase());

  return (
    // Backdrop is a real <button> so keyboard users have a "Close
    // dialog" focus target, and the lint rules treating onClick-on-div
    // as ambiguous don't fire. Dialog is a sibling — no bubbling.
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
        aria-label="Send invite"
        className="relative w-full max-w-lg bg-[#FFF8E7] border-2 border-[#3D2817] rounded-lg shadow-[6px_6px_0px_0px_rgba(61,40,23,1)] overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-3 bg-[#FFE8BA] border-b-2 border-[#3D2817]">
          <h2 className="text-lg font-bold text-[#3D2817]">Send invite</h2>
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
          <p className="text-sm text-[#785A38]">
            Inviting{" "}
            <span className="font-semibold text-[#3D2817]">"{playlistName}"</span>
            . Recipient gets it in their Invites inbox; accepting adds it to
            their library.
          </p>

          {/* ----- Username field ----- */}
          <div>
            <label
              htmlFor="invite-username"
              className="block text-sm font-semibold text-[#3D2817] mb-1"
            >
              SpinDeck username
            </label>
            <div className="relative">
              <input
                id="invite-username"
                ref={usernameRef}
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  if (picked) setPicked(null);
                }}
                placeholder="@vinyl_fan_42"
                spellCheck={false}
                autoComplete="off"
                maxLength={32}
                className="w-full rounded-md border-2 border-[#3D2817] px-3 py-2 bg-white text-[#3D2817] placeholder:text-[#785A38] focus:outline-none focus:ring-2 focus:ring-[#FF9F45]"
              />
              {showResults && (
                <div className="absolute left-0 right-0 top-full mt-1 border-2 border-[#3D2817] bg-white rounded-md shadow-[3px_3px_0px_0px_rgba(61,40,23,1)] z-10 max-h-60 overflow-y-auto">
                  {searching ? (
                    <p className="px-3 py-2 text-sm text-[#785A38]">Searching…</p>
                  ) : results.length === 0 ? (
                    <p className="px-3 py-2 text-sm text-[#785A38]">
                      No matches. Double-check the spelling.
                    </p>
                  ) : (
                    <ul className="divide-y divide-[#E6D5B8]">
                      {results.map((u) => (
                        <li key={u.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setPicked(u);
                              setQuery(u.username);
                              setResults([]);
                            }}
                            className="w-full text-left px-3 py-2 hover:bg-[#FFF8E7]"
                          >
                            <p className="font-semibold text-[#3D2817]">
                              @{u.username}
                            </p>
                            {u.displayName && (
                              <p className="text-xs text-[#785A38]">
                                {u.displayName}
                              </p>
                            )}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
            {picked && (
              <p className="mt-1 text-xs text-[#785A38]">
                Sending to{" "}
                <span className="font-semibold text-[#3D2817]">
                  @{picked.username}
                </span>
                {picked.displayName ? ` (${picked.displayName})` : ""}.
              </p>
            )}
          </div>

          {/* ----- Optional message ----- */}
          <div>
            <label
              htmlFor="invite-message"
              className="block text-sm font-semibold text-[#3D2817] mb-1"
            >
              Message{" "}
              <span className="font-normal text-[#785A38]">(optional)</span>
            </label>
            <Textarea
              id="invite-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={280}
              rows={3}
              placeholder="Thought you'd dig this one…"
              className="bg-white"
              aria-describedby="invite-message-counter"
            />
            <p
              id="invite-message-counter"
              className="mt-1 text-xs text-[#785A38] text-right"
            >
              {message.length} / 280
            </p>
          </div>

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
            disabled={submitting || !targetUsername}
            className="bg-[#FF9F45] hover:bg-[#FF8C2E] text-[#3D2817] font-semibold border-2 border-[#3D2817] shadow-[4px_4px_0px_0px_rgba(61,40,23,1)] hover:shadow-[2px_2px_0px_0px_rgba(61,40,23,1)] transition-all"
          >
            <Send className="size-4 mr-2" />
            {submitting ? "Sending…" : "Send invite"}
          </Button>
        </div>
      </form>
    </div>
  );
}
