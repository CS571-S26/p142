import { useNavigate } from "react-router";
import { Button } from "./ui/button";
import { VinylRecord } from "./VinylRecord";
import { useSpotify } from "../data/SpotifyContext";

export function LandingPage() {
  const navigate = useNavigate();
  const { login, isConnected, isLoading } = useSpotify();

  const handleClick = () => {
    if (isConnected) {
      navigate("/home");
    } else {
      login();
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-white">
      <div className="text-center space-y-12 p-8">
        <div className="flex justify-center">
          <div className="animate-spin" style={{ animationDuration: '8s' }}>
            <VinylRecord color="#000000" size={150} />
          </div>
        </div>
        
        <div className="space-y-4">
          <h1 className="text-6xl font-bold">Spin Deck</h1>
          <p className="text-xl text-gray-600">Annotate and explore your music collection</p>
        </div>

        <div>
          <Button 
            onClick={handleClick}
            disabled={isLoading}
            className="bg-black hover:bg-gray-800 text-white px-8 py-6 text-lg"
          >
            {isLoading
              ? "Loading..."
              : isConnected
                ? "Go to Playlists"
                : "Login with Spotify"}
          </Button>
        </div>
      </div>
    </div>
  );
}
