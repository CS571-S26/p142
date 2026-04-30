import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { supabase, SUPABASE_CONFIGURED } from "./supabaseClient";

// ---------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------

export interface AppUser {
  id: string; // matches auth.users.id
  username: string;
  displayName: string | null;
  vinylColor: string;
}

type Status =
  | "loading"     // initial auth bootstrap
  | "signed_out"  // no session — show AuthPage
  | "ready"       // have a full profile
  | "error";      // hard failure (e.g. Supabase not configured)

type Result = { ok: true } | { ok: false; error: string };

interface AppUserContextValue {
  status: Status;
  user: AppUser | null;
  error: string | null;
  signUp: (args: {
    email: string;
    password: string;
    username: string;
    displayName?: string;
  }) => Promise<Result>;
  signIn: (args: { identifier: string; password: string }) => Promise<Result>;
  updateProfile: (patch: Partial<Pick<AppUser, "displayName" | "vinylColor">>) => Promise<void>;
  signOut: () => Promise<void>;
}

const AppUserContext = createContext<AppUserContextValue | null>(null);

// ---------------------------------------------------------------------
// DB row → AppUser
// ---------------------------------------------------------------------

interface AppUserRow {
  id: string;
  username: string;
  display_name: string | null;
  vinyl_color: string;
}

function rowToUser(row: AppUserRow): AppUser {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    vinylColor: row.vinyl_color,
  };
}

// ---------------------------------------------------------------------
// Username validation — mirror the SQL check constraint so we can
// surface friendly errors before hitting the DB.
// ---------------------------------------------------------------------

const USERNAME_RE = /^[A-Za-z0-9_]+$/;

function validateUsername(raw: string): string | null {
  const u = raw.trim();
  if (u.length < 3) return "Username must be at least 3 characters.";
  if (u.length > 24) return "Username must be 24 characters or fewer.";
  if (!USERNAME_RE.test(u)) return "Letters, numbers, and underscores only.";
  return null;
}

function humanizeSupabaseError(message: string, code?: string): string {
  if (code === "23505") return "That username is already taken.";
  if (/already registered/i.test(message))
    return "That email is already registered. Try signing in instead.";
  if (/Invalid login credentials/i.test(message))
    return "Username/email or password is incorrect.";
  if (/Email not confirmed/i.test(message))
    return "This email hasn't been confirmed. Either confirm it from your inbox, or turn off email confirmation in Supabase dev settings.";
  return message;
}

// ---------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------

export function AppUserProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>(
    SUPABASE_CONFIGURED ? "loading" : "error"
  );
  const [user, setUser] = useState<AppUser | null>(null);
  const [error, setError] = useState<string | null>(
    SUPABASE_CONFIGURED
      ? null
      : "Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local."
  );

  const loadProfile = useCallback(async (authUserId: string): Promise<AppUser | null> => {
    const { data, error } = await supabase
      .from("app_users")
      .select("id, username, display_name, vinyl_color")
      .eq("id", authUserId)
      .maybeSingle();

    if (error) throw error;
    return data ? rowToUser(data as AppUserRow) : null;
  }, []);

  type ReconcileResult = "ready" | "signed_out" | "no_profile";

  // After any auth change, re-check the session and load the profile.
  // Returns a tag so callers (signIn/signUp) can surface the right
  // error instead of silently ending up back on the auth page.
  const reconcile = useCallback(async (): Promise<ReconcileResult> => {
    const { data } = await supabase.auth.getSession();
    const authUserId = data.session?.user?.id;
    if (!authUserId) {
      setUser(null);
      setStatus("signed_out");
      return "signed_out";
    }
    const profile = await loadProfile(authUserId);
    if (profile) {
      setUser(profile);
      setStatus("ready");
      return "ready";
    }
    // Auth user exists but there's no app_users row. Sign out so they
    // land back on the auth page instead of a half-working state.
    await supabase.auth.signOut();
    setUser(null);
    setStatus("signed_out");
    return "no_profile";
  }, [loadProfile]);

  // One-shot bootstrap on mount. No auto-sign-in.
  useEffect(() => {
    if (!SUPABASE_CONFIGURED) return;

    let cancelled = false;
    (async () => {
      try {
        await reconcile();
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setStatus("error");
      }
    })();

    // Listen for auth changes from other tabs, token refreshes, etc.
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      if (cancelled) return;
      reconcile().catch((e) => {
        setError(e instanceof Error ? e.message : String(e));
        setStatus("error");
      });
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [reconcile]);

  // -------------------------------------------------------------------
  // Sign up: email + password + username (+ optional display name).
  //
  // We pass the username and display name as signUp metadata
  // (options.data), and a Postgres trigger (see migration 002) creates
  // the matching app_users row on auth.users INSERT. Doing the profile
  // insert in a trigger — not in the client after signUp — means the
  // profile is always created even when email confirmation is enabled
  // (which makes signUp return no session).
  // -------------------------------------------------------------------
  const signUp = useCallback(
    async (args: {
      email: string;
      password: string;
      username: string;
      displayName?: string;
    }): Promise<Result> => {
      const usernameError = validateUsername(args.username);
      if (usernameError) return { ok: false, error: usernameError };

      const trimmedUsername = args.username.trim();
      const trimmedDisplayName = args.displayName?.trim() || "";

      try {
        // Pre-flight availability check. The unique constraint on
        // app_users.username would catch collisions eventually (the
        // trigger insert would fail, which rolls back the auth.users
        // insert), but the resulting error message is cryptic. A cheap
        // upfront check lets us surface a clean "already taken" error.
        // (Anon has SELECT on app_users per RLS, so this works before
        // the user is authenticated.)
        const { data: existing, error: checkError } = await supabase
          .from("app_users")
          .select("id")
          .eq("username", trimmedUsername)
          .maybeSingle();
        if (checkError) {
          return { ok: false, error: humanizeSupabaseError(checkError.message) };
        }
        if (existing) {
          return { ok: false, error: "That username is already taken." };
        }

        const { data, error } = await supabase.auth.signUp({
          email: args.email.trim(),
          password: args.password,
          options: {
            data: {
              username: trimmedUsername,
              display_name: trimmedDisplayName,
            },
          },
        });
        if (error) return { ok: false, error: humanizeSupabaseError(error.message) };

        if (!data.user?.id) {
          return { ok: false, error: "Sign-up didn't return a user id." };
        }

        // Email confirmation ON → no session yet, but the trigger has
        // already created the app_users row. User confirms via email,
        // then comes back and signs in.
        if (!data.session) {
          return {
            ok: false,
            error:
              "Check your email to confirm your account, then come back and sign in. " +
              "(Or disable email confirmation in Supabase dashboard → Authentication → Email → Confirm email.)",
          };
        }

        // Email confirmation OFF → session is live. Reconcile picks up
        // the profile the trigger just inserted.
        const result = await reconcile();
        if (result === "ready") return { ok: true };
        return {
          ok: false,
          error:
            "Account created, but your profile didn't load. Try signing in again.",
        };
      } catch (e) {
        console.error("[AppUserContext] signUp failed:", e);
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    },
    [reconcile]
  );

  // -------------------------------------------------------------------
  // Sign in: accepts either a username or an email in `identifier`.
  // If no "@", we resolve username → email via the email_for_username
  // RPC, then call signInWithPassword.
  // -------------------------------------------------------------------
  const signIn = useCallback(
    async (args: { identifier: string; password: string }): Promise<Result> => {
      try {
        const raw = args.identifier.trim();
        if (!raw) return { ok: false, error: "Enter your username or email." };

        let email = raw;
        if (!raw.includes("@")) {
          const { data, error } = await supabase.rpc("email_for_username", {
            p_username: raw,
          });
          if (error) {
            return {
              ok: false,
              error:
                "Couldn't look up that username. If this persists, run the " +
                "`email_for_username` migration in Supabase. " +
                `(${error.message})`,
            };
          }
          if (!data) return { ok: false, error: "No account with that username." };
          email = data as string;
        }

        const { error } = await supabase.auth.signInWithPassword({
          email,
          password: args.password,
        });
        if (error) return { ok: false, error: humanizeSupabaseError(error.message) };

        // reconcile() may decide to sign the user back out (e.g. if their
        // app_users profile row is missing). Surface that explicitly so
        // the form doesn't silently end up back on the auth page.
        const result = await reconcile();
        if (result === "ready") return { ok: true };
        if (result === "no_profile") {
          return {
            ok: false,
            error:
              "Your credentials worked, but we couldn't find a SpinDeck profile for " +
              "this account. Create a new account, or restore the app_users row in Supabase.",
          };
        }
        // "signed_out" here means the session vanished between
        // signInWithPassword and getSession — usually a storage/cookie
        // issue. Tell the user something specific rather than letting
        // the form look like it did nothing.
        return {
          ok: false,
          error:
            "Signed in, but the session didn't stick. Try again, or check that cookies / localStorage aren't blocked.",
        };
      } catch (e) {
        console.error("[AppUserContext] signIn failed:", e);
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    },
    [reconcile]
  );

  const updateProfile = useCallback(
    async (patch: Partial<Pick<AppUser, "displayName" | "vinylColor">>) => {
      if (!user) return;
      const dbPatch: Record<string, unknown> = {};
      if (patch.displayName !== undefined) dbPatch.display_name = patch.displayName;
      if (patch.vinylColor !== undefined) dbPatch.vinyl_color = patch.vinylColor;
      if (Object.keys(dbPatch).length === 0) return;

      const { data, error } = await supabase
        .from("app_users")
        .update(dbPatch)
        .eq("id", user.id)
        .select("id, username, display_name, vinyl_color")
        .single();

      if (error) throw error;
      setUser(rowToUser(data as AppUserRow));
    },
    [user]
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setStatus("signed_out");
  }, []);

  return (
    <AppUserContext.Provider
      value={{ status, user, error, signUp, signIn, updateProfile, signOut }}
    >
      {children}
    </AppUserContext.Provider>
  );
}

// Co-located with the provider for ergonomics; HMR's "fast refresh"
// dislikes mixing a hook + component in one module, but splitting these
// across files is more pain than it's worth for a hand-rolled context.
// eslint-disable-next-line react-refresh/only-export-components
export function useAppUser() {
  const ctx = useContext(AppUserContext);
  if (!ctx) throw new Error("useAppUser must be used within AppUserProvider");
  return ctx;
}
