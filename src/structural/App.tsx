import { createHashRouter, RouterProvider } from 'react-router-dom';

import { SpotifyProvider } from "../components/data/SpotifyContext";
import { PlayerProvider } from "../components/data/PlayerContext";
import { LandingPage } from "../components/pages/LandingPage";
import { HomePage } from "../components/pages/HomePage";
import { PlaylistView } from "../components/pages/PlaylistView";
import { SongView } from "../components/pages/SongView";
import { NowPlayingBar } from "../components/pages/NowPlayingBar";

const router = createHashRouter([
  { path: "/", Component: LandingPage },
  { path: "/home", Component: HomePage },
  { path: "/playlist/:playlistId", Component: PlaylistView },
  { path: "/playlist/:playlistId/song/:songId", Component: SongView },
]);

function AppInner() {
  return (
    <PlayerProvider>
      <RouterProvider router={router} />
      <NowPlayingBar />
    </PlayerProvider>
  );
}

function App() {
  return (
    <SpotifyProvider>
      <AppInner />
    </SpotifyProvider>
  );
}

export default App
