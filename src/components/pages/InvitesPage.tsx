import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { ArrowLeft, Check, LogOut, Mail, X } from "lucide-react";
import { Button } from "./ui/button";
import { useAppUser } from "../data/AppUserContext";
import {
  listPendingInvites,
  respondToInvite,
  type PendingInvite,
} from "../data/invitesApi";
import { formatError } from "../data/formatError";
import { VinylRecord } from "./VinylRecord";

// =============================================================================
// InvitesPage — dedicated /invites route.
// =============================================================================
// Used to live as a section on /home; promoted to its own page so the
// inbox feels like a real workspace rather than a stacked card. Same
// data + interaction model: Accept (auto-saves the playlist to your
// library) or Decline. Sender @username links to their profile.
//
// We don't share invites state with HomePage's badge — the page does
// its own fetch on mount. It's a small list and refetches happen on
// actions, so duplicating one Supabase round-trip on tab open is
// cheaper than threading state through a context.
// =============================================================================

export function InvitesPage() {
  const navigate = useNavigate();
  const { user, signOut } = useAppUser();

  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [loading, setLoading] = useState<boolean>(Boolean(user?.id));
  const [error, setError] = useState<string | null>(null);
  // Track which invite is currently being responded to so we can disable
  // its buttons (and grey them out) without locking the rest of the inbox.
  const [respondingInviteId, setRespondingInviteId] = useState<string | null>(
    null
  );

  const loadInvites = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    setError(null);
    try {
      const list = await listPendingInvites(user.id);
      setInvites(list);
    } catch (e) {
      setError(formatError(e, "Couldn't load invites."));
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void loadInvites();
  }, [loadInvites]);

  async function handleInviteResponse(
    invite: PendingInvite,
    action: "accept" | "decline"
  ) {
    if (!user?.id) return;
    if (respondingInviteId) return; // one at a time
    setRespondingInviteId(invite.id);
    // Optimistically pop the row out — if the call fails we put it back.
    const snapshot = invites;
    setInvites((prev) => prev.filter((i) => i.id !== invite.id));
    try {
      await respondToInvite({
        inviteId: invite.id,
        recipientId: user.id,
        playlistId: invite.playlistId,
        action,
      });
      // respondToInvite() does the auto-save server-side on accept,
      // so /home's Saved section will pick it up on next mount —
      // nothing more to do here.
    } catch (e) {
      setInvites(snapshot);
      setError(formatError(e, "Couldn't update invite. Please try again."));
    } finally {
      setRespondingInviteId(null);
    }
  }

  return (
    <div className="min-h-screen w-full bg-[#FFF8E7] pb-24">
      <header className="border-b-2 border-[#3D2817] bg-[#FFE8BA] sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-8 py-3 sm:py-4 flex items-center justify-between gap-2">
          <Button
            variant="ghost"
            onClick={() => navigate("/home")}
            className="text-[#3D2817]"
          >
            <ArrowLeft className="size-5 mr-2" />
            Back
          </Button>
          {user && (
            <Button
              variant="ghost"
              onClick={() => void signOut()}
              className="text-[#785A38] hover:text-red-600"
            >
              <LogOut className="size-4 mr-2" />
              Log out
            </Button>
          )}
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-8 py-6 sm:py-12">
        <div className="mb-6 sm:mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-[#3D2817] flex items-center gap-2">
            <Mail className="size-7 sm:size-8" />
            Invites
            {invites.length > 0 && (
              <span className="ml-1 inline-flex items-center justify-center min-w-[1.75rem] h-7 px-2 rounded-full bg-[#FF9F45] text-[#3D2817] text-base font-bold border-2 border-[#3D2817]">
                {invites.length}
              </span>
            )}
          </h1>
          <p className="text-sm text-[#785A38] mt-1">
            Playlists other SpinDeck users have sent you. Accept to save
            them straight to your library.
          </p>
        </div>

        {loading ? (
          <div className="text-center py-12 text-[#785A38]">
            <p>Loading invites…</p>
          </div>
        ) : error ? (
          <div className="text-center py-12 text-red-600">
            <p>{error}</p>
          </div>
        ) : invites.length === 0 ? (
          <div className="border-2 border-dashed border-[#785A38] rounded-lg p-8 sm:p-10 text-center bg-white/50">
            <Mail className="size-6 mx-auto mb-2 text-[#785A38]" />
            <p className="text-[#3D2817] font-semibold mb-1">
              No invites right now
            </p>
            <p className="text-sm text-[#785A38]">
              When another SpinDeck user invites you to a playlist, it'll
              land here. Open any playlist and tap{" "}
              <span className="font-semibold">Invite</span> to send one of
              your own.
            </p>
          </div>
        ) : (
          <ul className="space-y-3 sm:space-y-4">
            {invites.map((invite) => {
              const responding = respondingInviteId === invite.id;
              return (
                <li
                  key={invite.id}
                  className="border-2 border-[#3D2817] rounded-lg bg-white shadow-[4px_4px_0px_0px_rgba(61,40,23,1)] p-4 sm:p-5 flex flex-col sm:flex-row gap-4 sm:gap-5 items-stretch sm:items-center"
                >
                  <button
                    type="button"
                    onClick={() =>
                      navigate(`/app-playlist/${invite.playlistId}`)
                    }
                    className="flex-shrink-0 self-center sm:self-auto rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FF9F45]"
                    title={`Preview "${invite.playlistName}"`}
                  >
                    <VinylRecord
                      color={invite.playlistVinylColor}
                      className="size-24 sm:size-28 transition-transform hover:scale-105 hover:rotate-12"
                    />
                  </button>

                  <div className="flex-1 min-w-0 text-center sm:text-left">
                    <p className="text-xs text-[#785A38] mb-1">
                      From{" "}
                      <Link
                        to={`/u/${invite.senderUsername}`}
                        className="font-semibold text-[#3D2817] hover:underline rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FF9F45]"
                      >
                        @{invite.senderUsername}
                      </Link>
                      {invite.senderDisplayName
                        ? ` (${invite.senderDisplayName})`
                        : ""}
                    </p>
                    <h2 className="font-semibold text-base sm:text-lg text-[#3D2817] line-clamp-2">
                      {invite.playlistName}
                    </h2>
                    <p className="text-xs sm:text-sm text-[#785A38] mb-2">
                      {invite.playlistSongCount}{" "}
                      {invite.playlistSongCount === 1 ? "song" : "songs"}
                    </p>
                    {invite.message && (
                      <blockquote className="border-l-4 border-[#FF9F45] pl-3 py-1 text-sm text-[#3D2817] whitespace-pre-wrap bg-[#FFF8E7] rounded-r text-left">
                        {invite.message}
                      </blockquote>
                    )}
                  </div>

                  <div className="flex flex-row sm:flex-col gap-2 sm:gap-2 justify-center sm:justify-start sm:self-center flex-shrink-0">
                    <Button
                      onClick={() =>
                        void handleInviteResponse(invite, "accept")
                      }
                      disabled={responding}
                      className="bg-[#FF9F45] hover:bg-[#FF8C2E] text-[#3D2817] font-semibold border-2 border-[#3D2817] shadow-[4px_4px_0px_0px_rgba(61,40,23,1)] hover:shadow-[2px_2px_0px_0px_rgba(61,40,23,1)] transition-all"
                    >
                      <Check className="size-4 mr-1" />
                      {responding ? "…" : "Accept"}
                    </Button>
                    <Button
                      onClick={() =>
                        void handleInviteResponse(invite, "decline")
                      }
                      disabled={responding}
                      variant="outline"
                      className="bg-white hover:bg-[#FFE4E4] text-[#3D2817] font-semibold border-2 border-[#3D2817]"
                    >
                      <X className="size-4 mr-1" />
                      Decline
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
