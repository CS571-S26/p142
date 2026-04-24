import type { ReactNode } from "react";
import { createHashRouter, RouterProvider } from "react-router-dom";

import { SpotifyProvider } from "../components/data/SpotifyContext";
import { PlayerProvider } from "../components/data/PlayerContext";
import { AppUserProvider, useAppUser } from "../components/data/AppUserContext";
import { AuthPage } from "../components/auth/AuthPage";
import { LandingPage } from "../components/pages/LandingPage";
import { HomePage } from "../components/pages/HomePage";
import { PlaylistView } from "../components/pages/PlaylistView";
import { AppPlaylistView } from "../components/pages/AppPlaylistView";
import { SongView } from "../components/pages/SongView";
import { NowPlayingBar } from "../components/pages/NowPlayingBar";

// ---------------------------------------------------------------------------
// RequireAuth — per-route gate for anything that needs a signed-in user.
// ---------------------------------------------------------------------------
// Most of the app is still owner-only. `/app-playlist/:id` is the one public
// route: anyone with the link can view an annotated playlist (and see a
// subtle "Sign up" CTA). That route is NOT wrapped in RequireAuth; everything
// else is.
function Splash() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#FFF8E7]">
      <p className="text-[#8B6F47]">Loading…</p>
    </div>
  );
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAppUser();
  if (status === "loading") return <Splash />;
  if (status === "signed_out") return <AuthPage />;
  // "ready" and "error" fall through — error is handled globally in AppGate.
  return <>{children}</>;
}

const router = createHashRouter([
  { path: "/", element: <RequireAuth><LandingPage /></RequireAuth> },
  { path: "/home", element: <RequireAuth><HomePage /></RequireAuth> },
  {
    path: "/playlist/:playlistId",
    element: <RequireAuth><PlaylistView /></RequireAuth>,
  },
  {
    path: "/playlist/:playlistId/song/:songId",
    element: <RequireAuth><SongView /></RequireAuth>,
  },
  // Public route — no auth required. AppPlaylistView handles the anonymous
  // rendering path itself.
  { path: "/app-playlist/:playlistId", Component: AppPlaylistView },
]);

// ---------------------------------------------------------------------------
// AppGate — top-level boot gate.
// ---------------------------------------------------------------------------
// We used to block the entire router on signed_out. Now the router renders
// regardless so anonymous visitors can reach shared /app-playlist/:id links;
// protected routes gate themselves via <RequireAuth>.
function AppGate() {
  const { status, error } = useAppUser();

  if (status === "loading") {
    return <Splash />;
  }

  if (status === "error") {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-[#FFF8E7] p-8">
        <div className="max-w-md text-center space-y-3">
          <h1 className="text-2xl font-bold text-[#3D2817]">Couldn't start SpinDeck</h1>
          <p className="text-[#8B6F47]">{error ?? "Unknown error."}</p>
        </div>
      </div>
    );
  }

  // Both "ready" and "signed_out" render the router — per-route RequireAuth
  // handles kicking signed-out users to the AuthPage for protected paths.
  return (
    <PlayerProvider>
      <RouterProvider router={router} />
      <NowPlayingBar />
    </PlayerProvider>
  );
}

function App() {
  return (
    <AppUserProvider>
      <SpotifyProvider>
        <AppGate />
      </SpotifyProvider>
    </AppUserProvider>
  );
}

export default App;
