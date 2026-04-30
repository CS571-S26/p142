import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { LogOut } from "lucide-react";
import { Button } from "./ui/button";
import { useSpotify } from "../data/SpotifyContext";
import { useAppUser } from "../data/AppUserContext";
import { SpinDeckLogo } from "./SpinDeckLogo";
import {
  consumePostAuthRedirect,
  extractAppPlaylistId,
} from "../data/postAuthRedirect";
import { savePlaylist } from "../data/savedPlaylistsApi";

export function LandingPage() {
  const navigate = useNavigate();
  const { login, isConnected, isLoading } = useSpotify();
  const { user, signOut } = useAppUser();

  const enter = () => navigate("/home");

  // After signOut, AppUserContext flips status to "signed_out" and the
  // AppGate re-renders <AuthPage />, so no explicit navigate() needed.
  const handleSignOut = () => {
    void signOut();
  };

  // -----------------------------------------------------------------
  // Honor a pending post-auth redirect.
  //
  // When an anonymous viewer clicks Sign up from a public share page,
  // AppPlaylistView stashes { returnTo, autoSave } in sessionStorage.
  // Once they're signed in the router lands them here at "/". This
  // effect consumes the stash, optionally auto-saves the playlist,
  // and bounces them back to where they started — so the share-link
  // flow becomes "open link → sign up → land back on the playlist
  // (saved)" instead of the previous double-open dead-end.
  // -----------------------------------------------------------------
  const [redirecting, setRedirecting] = useState(false);
  useEffect(() => {
    if (!user?.id) return;
    const intent = consumePostAuthRedirect();
    if (!intent) return;
    // Intentional setState-in-effect: we need to swap into a "loading"
    // splash before the async auto-save kicks off. The cascading render
    // is exactly the desired behavior here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRedirecting(true);

    void (async () => {
      // Best-effort auto-save. If it fails (network, RLS, anything),
      // we still want to land the user on the playlist — they can hit
      // the Save button manually from there.
      if (intent.autoSave) {
        const playlistId = extractAppPlaylistId(intent.returnTo);
        if (playlistId) {
          try {
            await savePlaylist(user.id, playlistId);
          } catch {
            // Swallow — auto-save is convenience, not a hard requirement.
          }
        }
      }
      navigate(intent.returnTo, { replace: true });
    })();
  }, [user?.id, navigate]);

  if (redirecting) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-[#FFF8E7]">
        <p className="text-[#785A38]">
          Welcome — taking you back to the playlist…
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#FFF8E7] px-4 py-8">
      <div className="text-center space-y-6 sm:space-y-10 p-4 sm:p-8 max-w-xl w-full">
        <div className="flex justify-center">
          {/* Two renders + Tailwind hide/show: smaller logo on phones,
              full size from sm: up. The component sets width/height as
              inline style, so we can't make a single render responsive. */}
          <div className="sm:hidden">
            <SpinDeckLogo size={180} />
          </div>
          <div className="hidden sm:block">
            <SpinDeckLogo size={288} />
          </div>
        </div>

        <div className="space-y-3">
          <h1 className="text-4xl sm:text-6xl font-bold text-[#3D2817]">Spin Deck</h1>
          <p className="text-base sm:text-xl text-[#785A38]">
            Annotate and explore your music collection
          </p>
          {user && (
            <p className="text-sm text-[#785A38]">
              Signed in as <span className="font-semibold">@{user.username}</span>
            </p>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-3 items-stretch justify-center">
          <Button
            onClick={enter}
            className="flex-1 bg-[#FF9F45] hover:bg-[#FF8C2E] text-[#3D2817] font-semibold border-2 border-[#3D2817] shadow-[4px_4px_0px_0px_rgba(61,40,23,1)] hover:shadow-[2px_2px_0px_0px_rgba(61,40,23,1)] px-4 sm:px-8 py-4 sm:py-6 text-base sm:text-lg transition-all"
          >
            Enter SpinDeck
          </Button>

          <Button
            onClick={isConnected ? enter : login}
            disabled={isLoading}
            variant="outline"
            className="flex-1 bg-white hover:bg-[#FFE8BA] text-[#3D2817] font-semibold border-2 border-[#3D2817] shadow-[4px_4px_0px_0px_rgba(61,40,23,1)] hover:shadow-[2px_2px_0px_0px_rgba(61,40,23,1)] px-4 sm:px-8 py-4 sm:py-6 text-base sm:text-lg transition-all"
          >
            {isLoading
              ? "Loading…"
              : isConnected
                ? "Spotify connected ✓"
                : "Connect Spotify"}
          </Button>

          <Button
            onClick={handleSignOut}
            variant="outline"
            className="flex-1 bg-white hover:bg-[#FFE4E4] text-[#3D2817] font-semibold border-2 border-[#3D2817] shadow-[4px_4px_0px_0px_rgba(61,40,23,1)] hover:shadow-[2px_2px_0px_0px_rgba(61,40,23,1)] px-4 sm:px-8 py-4 sm:py-6 text-base sm:text-lg transition-all"
          >
            <LogOut className="size-4 mr-2" />
            Log out
          </Button>
        </div>

        <p className="text-sm text-[#785A38]">
          Spotify is optional — it unlocks in-app playback and syncs your
          playlists. Notes and favorites work without it.
        </p>
      </div>
    </div>
  );
}
