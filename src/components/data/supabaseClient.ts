import { createClient } from "@supabase/supabase-js";

// Vite exposes VITE_-prefixed env vars on import.meta.env. These are set
// in .env.local (see .env.local.example). The anon key is safe to ship
// in the browser — Row-Level Security on Supabase enforces who can
// read/write what.
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // Fail loudly in dev so a missing .env doesn't silently break things.
  console.warn(
    "[supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY — " +
      "set them in .env.local. Auth + notes features will be disabled."
  );
}

export const supabase = createClient(url ?? "", anonKey ?? "", {
  auth: {
    // Persist session in localStorage under a dedicated key so it doesn't
    // collide with our Spotify token keys.
    storageKey: "spindeck-auth",
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false, // no magic links; we use anonymous sign-in
  },
});

export const SUPABASE_CONFIGURED = Boolean(url && anonKey);
