// ---------------------------------------------------------------------------
// Vinyl label style — single source of truth.
// ---------------------------------------------------------------------------
// The four asymmetric marks rendered on every <VinylRecord>. The SVG
// is otherwise rotationally symmetric, so without one of these the
// spin animation is technically running but visually invisible.
// Users pick their preferred style on /profile; the choice is stored
// on app_users.vinyl_label_style and applied globally.
//
// Why this lives in its own module: AppUserContext is a component
// file and `react-refresh/only-export-components` doesn't want
// non-component exports there. Mirrors the pattern used by
// `vinylColors.ts`.
// ---------------------------------------------------------------------------

export type VinylLabelStyle = "wordmark" | "monogram" | "tick" | "spokes";

export const VINYL_LABEL_STYLES: VinylLabelStyle[] = [
  "wordmark",
  "monogram",
  "tick",
  "spokes",
];

export const DEFAULT_VINYL_LABEL_STYLE: VinylLabelStyle = "wordmark";

// Defensive: the DB CHECK constraint enforces these four values, but
// if a user row was inserted before the migration ran (or if a future
// style is removed) we'd see an unrecognized value here. Falls back
// to the default in that case.
export function parseLabelStyle(raw: string | null | undefined): VinylLabelStyle {
  if (raw && (VINYL_LABEL_STYLES as string[]).includes(raw)) {
    return raw as VinylLabelStyle;
  }
  return DEFAULT_VINYL_LABEL_STYLE;
}
