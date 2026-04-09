import { Link } from "react-router-dom";
import reactLogo from '../../assets/react.svg'

function BadgerLayout(props: { chatrooms: string[] }) {
  const chatrooms = props.chatrooms;

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <nav className="border-b border-zinc-800 bg-zinc-900">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-3 text-lg font-semibold">
            <img
              alt="SpinDeck Logo"
              src={reactLogo}
              className="h-8 w-8"
            />
            <span>SpinDeck</span>
          </Link>

          <div className="flex items-center gap-6">
            <Link
              to="/"
              className="text-sm text-zinc-300 transition hover:text-white"
            >
              Home
            </Link>

            <div className="flex items-center gap-3">
              {chatrooms.map((c) => (
                <Link
                  key={c}
                  to={`/chatrooms/${c}`}
                  className="rounded-md bg-zinc-800 px-3 py-2 text-sm text-zinc-200 transition hover:bg-zinc-700 hover:text-white"
                >
                  {c}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-6xl px-6 py-8">
        <p className="text-zinc-300">TEST</p>
      </main>
    </div>
  );
}

export default BadgerLayout;