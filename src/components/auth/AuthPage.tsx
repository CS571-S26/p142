import { useState, type FormEvent } from "react";
import { Button } from "../pages/ui/button";
import { useAppUser } from "../data/AppUserContext";
import { SpinDeckLogo } from "../pages/SpinDeckLogo";

type Mode = "sign_in" | "sign_up";

// Signed-out landing. Defaults to sign-in (returning users are the
// common case); new users toggle to sign-up.
export function AuthPage() {
  const { signIn, signUp } = useAppUser();
  const [mode, setMode] = useState<Mode>("sign_in");

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#FFF8E7] px-4 py-10">
      <div className="w-full max-w-md space-y-8">
        <div className="flex flex-col items-center space-y-4">
          <SpinDeckLogo size={128} />
          <h1 className="text-4xl font-bold text-[#3D2817]">Spin Deck</h1>
          <p className="text-[#8B6F47] text-center">
            Annotate and explore your music collection
          </p>
        </div>

        <ModeTabs mode={mode} onChange={setMode} />

        {mode === "sign_in" ? (
          <SignInForm onSubmit={signIn} onSwitch={() => setMode("sign_up")} />
        ) : (
          <SignUpForm onSubmit={signUp} onSwitch={() => setMode("sign_in")} />
        )}
      </div>
    </div>
  );
}

// -------------------------------------------------------------------
// Shared bits
// -------------------------------------------------------------------

const INPUT_CLASS =
  "w-full px-4 py-3 rounded-lg bg-white border-2 border-[#3D2817] text-[#3D2817] placeholder-[#8B6F47] focus:outline-none focus:ring-2 focus:ring-[#FF9F45]";

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="text-sm font-semibold text-[#3D2817]">{children}</label>;
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="rounded-lg border-2 border-[#D94545] bg-[#FFE4E4] text-[#3D2817] px-4 py-3 text-sm"
    >
      {message}
    </div>
  );
}

function ModeTabs({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  const activeClass =
    "bg-[#FF9F45] text-[#3D2817] shadow-[2px_2px_0px_0px_rgba(61,40,23,1)]";
  const inactiveClass = "bg-white text-[#8B6F47] hover:text-[#3D2817]";

  return (
    <div className="flex gap-2 p-1 rounded-lg border-2 border-[#3D2817] bg-white">
      <button
        type="button"
        onClick={() => onChange("sign_in")}
        className={`flex-1 py-2 rounded-md font-semibold transition-all ${
          mode === "sign_in" ? activeClass : inactiveClass
        }`}
      >
        Sign in
      </button>
      <button
        type="button"
        onClick={() => onChange("sign_up")}
        className={`flex-1 py-2 rounded-md font-semibold transition-all ${
          mode === "sign_up" ? activeClass : inactiveClass
        }`}
      >
        Create account
      </button>
    </div>
  );
}

// -------------------------------------------------------------------
// Sign in — accepts username OR email
// -------------------------------------------------------------------

function SignInForm({
  onSubmit,
  onSwitch,
}: {
  onSubmit: (args: { identifier: string; password: string }) => Promise<{ ok: true } | { ok: false; error: string }>;
  onSwitch: () => void;
}) {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handle(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const r = await onSubmit({ identifier, password });
    setSubmitting(false);
    if (!r.ok) setError(r.error);
  }

  return (
    <form onSubmit={handle} className="space-y-4">
      <div className="space-y-1">
        <FieldLabel>Username or email</FieldLabel>
        <input
          type="text"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          placeholder="vinyl_fan_42 or you@example.com"
          autoComplete="username"
          spellCheck={false}
          required
          className={INPUT_CLASS}
        />
      </div>

      <div className="space-y-1">
        <FieldLabel>Password</FieldLabel>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
          className={INPUT_CLASS}
        />
      </div>

      {error && <ErrorBanner message={error} />}

      <Button
        type="submit"
        disabled={submitting || !identifier || !password}
        className="w-full bg-[#FF9F45] hover:bg-[#FF8C2E] text-[#3D2817] font-semibold border-2 border-[#3D2817] shadow-[4px_4px_0px_0px_rgba(61,40,23,1)] hover:shadow-[2px_2px_0px_0px_rgba(61,40,23,1)] py-6 text-lg transition-all disabled:opacity-60"
      >
        {submitting ? "Signing in…" : "Sign in"}
      </Button>

      <p className="text-sm text-[#8B6F47] text-center pt-1">
        Don't have an account?{" "}
        <button
          type="button"
          onClick={onSwitch}
          className="text-[#3D2817] underline hover:text-[#FF8C2E]"
        >
          Create one
        </button>
      </p>
    </form>
  );
}

// -------------------------------------------------------------------
// Sign up — email + password + username
// -------------------------------------------------------------------

function SignUpForm({
  onSubmit,
  onSwitch,
}: {
  onSubmit: (args: {
    email: string;
    password: string;
    username: string;
    displayName?: string;
  }) => Promise<{ ok: true } | { ok: false; error: string }>;
  onSwitch: () => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handle(e: FormEvent) {
    e.preventDefault();
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    setError(null);
    setSubmitting(true);
    const r = await onSubmit({ email, password, username, displayName });
    setSubmitting(false);
    if (!r.ok) setError(r.error);
  }

  return (
    <form onSubmit={handle} className="space-y-4">
      <div className="space-y-1">
        <FieldLabel>Username</FieldLabel>
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="vinyl_fan_42"
          autoComplete="username"
          spellCheck={false}
          maxLength={24}
          required
          className={INPUT_CLASS}
        />
        <p className="text-xs text-[#8B6F47]">
          3–24 characters. Letters, numbers, and underscores only.
        </p>
      </div>

      <div className="space-y-1">
        <FieldLabel>
          Display name <span className="text-[#8B6F47] font-normal">(optional)</span>
        </FieldLabel>
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Eli"
          autoComplete="off"
          maxLength={80}
          className={INPUT_CLASS}
        />
      </div>

      <div className="space-y-1">
        <FieldLabel>Password</FieldLabel>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          minLength={6}
          required
          className={INPUT_CLASS}
        />
        <p className="text-xs text-[#8B6F47]">At least 6 characters.</p>
      </div>

      <div className="space-y-1">
        <FieldLabel>
          Email <span className="text-[#8B6F47] font-normal">(for password recovery)</span>
        </FieldLabel>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          autoComplete="email"
          required
          className={INPUT_CLASS}
        />
      </div>

      {error && <ErrorBanner message={error} />}

      <Button
        type="submit"
        disabled={submitting || !email || !password || !username}
        className="w-full bg-[#FF9F45] hover:bg-[#FF8C2E] text-[#3D2817] font-semibold border-2 border-[#3D2817] shadow-[4px_4px_0px_0px_rgba(61,40,23,1)] hover:shadow-[2px_2px_0px_0px_rgba(61,40,23,1)] py-6 text-lg transition-all disabled:opacity-60"
      >
        {submitting ? "Creating…" : "Create account"}
      </Button>

      <p className="text-sm text-[#8B6F47] text-center pt-1">
        Already have an account?{" "}
        <button
          type="button"
          onClick={onSwitch}
          className="text-[#3D2817] underline hover:text-[#FF8C2E]"
        >
          Sign in
        </button>
      </p>
    </form>
  );
}
