// ---------------------------------------------------------------------------
// formatError — coerce anything-thrown into a human-readable string.
// ---------------------------------------------------------------------------
// Supabase's PostgrestError is a plain object (not an Error instance), so
// the usual `e instanceof Error ? e.message : String(e)` shortcut renders
// it as `[object Object]`. This helper checks for the common shapes we
// actually catch in the app:
//
//   • Error           → e.message
//   • PostgrestError  → e.message (+ e.hint if present, e.g. schema-cache
//                        misses tell you the exact table name to fix)
//   • string          → as-is
//   • everything else → JSON.stringify, falling back to String()
//
// Pass a fallback message for the rare case where the error has no
// .message at all (network blip with an empty body, etc).
// ---------------------------------------------------------------------------

export function formatError(e: unknown, fallback = "Something went wrong."): string {
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message || fallback;
  if (e && typeof e === "object") {
    const obj = e as { message?: unknown; hint?: unknown };
    const msg = typeof obj.message === "string" ? obj.message : null;
    const hint = typeof obj.hint === "string" ? obj.hint : null;
    if (msg && hint) return `${msg} (${hint})`;
    if (msg) return msg;
    try {
      return JSON.stringify(e);
    } catch {
      return fallback;
    }
  }
  return fallback;
}
