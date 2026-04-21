import { useNavigate } from "react-router";
import { Button } from "./ui/button";
import { useSpotify } from "../data/SpotifyContext";
import { SpinDeckLogo } from "./SpinDeckLogo";

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
    <div className="min-h-screen w-full flex items-center justify-center bg-[#FFF8E7]">
      <div className="text-center space-y-12 p-8">
        <div className="flex justify-center">
          <SpinDeckLogo size={288} />
        </div>
        
        <div className="space-y-4">
          <h1 className="text-6xl font-bold text-[#3D2817]">Spin Deck</h1>
          <p className="text-xl text-[#8B6F47]">Annotate and explore your music collection</p>
        </div>

        <div>
          <Button 
            onClick={handleClick}
            disabled={isLoading}
            className="bg-[#FF9F45] hover:bg-[#FF8C2E] text-[#3D2817] font-semibold border-2 border-[#3D2817] shadow-[4px_4px_0px_0px_rgba(61,40,23,1)] hover:shadow-[2px_2px_0px_0px_rgba(61,40,23,1)] px-8 py-6 text-lg transition-all"
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
