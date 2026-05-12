// ---------------------------------------------------------------------------
// Vinyl color palette — single source of truth.
// ---------------------------------------------------------------------------
// Used in three places:
//
//   • `appPlaylistsApi.ts` — default colors for new SpinDeck playlists,
//     and the swatch palette in CreatePlaylistModal.
//   • `spotifyApi.ts` — round-robin assignment of a vinyl color to each
//     of the user's Spotify-sourced playlists (so HomePage cards aren't
//     all the same color).
//   • `AppUserContext.tsx` — every user picks one for their profile
//     avatar (defaults to the first entry).
//
// Adding a color: append to the array (don't reorder — it would shuffle
// every existing user's already-assigned colors).
//
// Pickability: each color needs to read clearly against the white
// center label inside `VinylRecord.tsx` (so very light colors washing
// into the label aren't ideal). Otherwise we keep the door open to a
// broad palette — these are vinyl-record colors, vibrant is fine.
// ---------------------------------------------------------------------------

export const VINYL_COLORS = [
  // ---- Original 12 (do not reorder; existing rows reference by index) ----
  "#1a1a2e", // dark navy
  "#16213e", // deep blue
  "#0f3460", // navy blue
  "#e94560", // crimson red
  "#533483", // royal purple
  "#2b2d42", // charcoal
  "#8d99ae", // slate gray (lightest of the original — borderline)
  "#d90429", // bright red
  "#006d77", // dark teal
  "#e29578", // dusty coral
  "#264653", // forest blue
  "#2a9d8f", // sea green

  // ---- Expansion set (added 2026-05-06): on-brand earth tones + ----------
  // ---- broader hues so users with many playlists don't hit obvious -------
  // ---- repeats from the round-robin assignment in spotifyApi. ------------
  "#3D2817", // brand brown — matches borders/text elsewhere in the app
  "#FF9F45", // brand orange — same as the favicon
  "#7C2D12", // rust
  "#000000", // classic vinyl black
  "#7C3AED", // electric violet
  "#0EA5E9", // sky blue
  "#10B981", // emerald
  "#F59E0B", // warm amber
  "#BE185D", // deep magenta
  "#1F2937", // gunmetal slate
  "#9333EA", // grape purple
  "#65A30D", // olive lime
];
