import { useId } from "react";
import {
  DEFAULT_VINYL_LABEL_STYLE,
  useAppUser,
  type VinylLabelStyle,
} from "../data/AppUserContext";

interface VinylRecordProps {
  color: string;
  /**
   * Pixel size for the SVG. Used when no `className` is supplied.
   * If `className` is given (e.g. "size-32 sm:size-44"), Tailwind drives
   * the rendered size and this prop is ignored — that's how we get
   * responsive vinyl sizes across breakpoints without rerendering.
   */
  size?: number;
  className?: string;
  /**
   * Continuous spin. Used by pages that know the playlist this vinyl
   * represents is currently playing. Hover-triggered spin is handled
   * separately via the `.group:hover .vinyl-disc` CSS rule (see
   * index.css) — pages don't need to pass anything for that.
   */
  spinning?: boolean;
  /**
   * Override the asymmetric mark printed on the label. Optional — when
   * omitted, we read the current user's preference from
   * `AppUserContext` so every vinyl in the app updates together when
   * the user picks a new style on /profile. Anonymous viewers
   * (no signed-in user) fall back to DEFAULT_VINYL_LABEL_STYLE.
   *
   * The label needs SOMETHING off-center because the rest of the SVG
   * is purely concentric circles — without an asymmetric feature the
   * spin animation is technically running but visually invisible.
   */
  labelStyle?: VinylLabelStyle;
}

export function VinylRecord({
  color,
  size = 200,
  className,
  spinning = false,
  labelStyle,
}: VinylRecordProps) {
  // Read the signed-in user's label-style preference. If a prop was
  // passed, it overrides; otherwise we use the user's saved choice;
  // otherwise we fall back to the default (anonymous viewers + brand-
  // new accounts).
  const { user } = useAppUser();
  const effectiveStyle: VinylLabelStyle =
    labelStyle ?? user?.vinylLabelStyle ?? DEFAULT_VINYL_LABEL_STYLE;

  // When a className is provided, leave width/height off so Tailwind's
  // size-* utilities can take over. Otherwise pin to the numeric size.
  const sized = className ? {} : { width: size, height: size };

  // `vinyl-disc` enables the always-attached, paused-by-default spin
  // animation (defined in index.css). `.spinning` flips the play-state
  // to `running`. The hover variant comes from a `.group:hover`
  // ancestor and doesn't need a prop here.
  const discClass = `vinyl-disc${spinning ? " spinning" : ""}`;
  const mergedClassName = className ? `${className} ${discClass}` : discClass;

  // Each VinylRecord on the page needs its own <defs> id so the
  // wordmark's textPath doesn't collide with another instance.
  const wordmarkPathId = `vinyl-wordmark-${useId()}`;

  return (
    // Purely decorative — the playlist name (or whatever the vinyl is
    // visualizing) is always rendered as text right next to the SVG, so
    // exposing it to assistive tech would just make screen readers say
    // "image" before every playlist card. aria-hidden + role="img"
    // omitted means screen readers ignore it entirely.
    <svg
      {...sized}
      className={mergedClassName}
      viewBox="0 0 200 200"
      fill="none"
      aria-hidden="true"
      focusable="false"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Outer circle - vinyl */}
      <circle cx="100" cy="100" r="95" fill={color} />

      {/* Grooves */}
      <circle cx="100" cy="100" r="85" fill="none" stroke="rgba(0,0,0,0.1)" strokeWidth="1" />
      <circle cx="100" cy="100" r="75" fill="none" stroke="rgba(0,0,0,0.1)" strokeWidth="1" />
      <circle cx="100" cy="100" r="65" fill="none" stroke="rgba(0,0,0,0.1)" strokeWidth="1" />
      <circle cx="100" cy="100" r="55" fill="none" stroke="rgba(0,0,0,0.1)" strokeWidth="1" />
      <circle cx="100" cy="100" r="45" fill="none" stroke="rgba(0,0,0,0.1)" strokeWidth="1" />

      {/* Highlight arc — thin lighter sweep on the disc surface,
          mimics a light reflection on the vinyl. Rotates with the
          disc and reinforces the spin on darker disc colors no matter
          which label style is selected. */}
      <path
        d="M 100 10 A 90 90 0 0 1 178 55"
        stroke="rgba(255,255,255,0.22)"
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
      />

      {/* Label */}
      <circle cx="100" cy="100" r="35" fill="white" />

      {/* Label text rings — drawn UNDER the chosen style so a thin
          ring doesn't interrupt the wordmark / monogram glyphs. */}
      <circle cx="100" cy="100" r="30" fill="none" stroke="#e0e0e0" strokeWidth="0.5" />
      <circle cx="100" cy="100" r="25" fill="none" stroke="#e0e0e0" strokeWidth="0.5" />
      <circle cx="100" cy="100" r="20" fill="none" stroke="#e0e0e0" strokeWidth="0.5" />
      <circle cx="100" cy="100" r="15" fill="none" stroke="#e0e0e0" strokeWidth="0.5" />

      {/* ---- Asymmetric label mark (the "you can see it spinning" cue) ---- */}
      {effectiveStyle === "wordmark" && (
        // Curved SPINDECK wordmark hugging the upper rim of the label.
        // The arc is concave-up (sweep=0 in SVG's flipped y-axis) so
        // letters sit on top with their feet pointing toward the
        // spindle, which is the natural orientation for printed
        // record-label text.
        <>
          <defs>
            <path
              id={wordmarkPathId}
              d="M 75 105 A 25 25 0 0 1 125 105"
              fill="none"
            />
          </defs>
          <text
            fill="#3D2817"
            fontSize="6.5"
            fontWeight="800"
            fontFamily="ui-sans-serif, system-ui, sans-serif"
            letterSpacing="1.4"
          >
            <textPath
              href={`#${wordmarkPathId}`}
              startOffset="50%"
              textAnchor="middle"
            >
              SPINDECK
            </textPath>
          </text>
        </>
      )}

      {effectiveStyle === "monogram" && (
        // Bold "SD" sitting above the spindle hole. We deliberately
        // place it OFF-CENTER (y=82, well above the y=100 spindle) so
        // a) rotation is visible and b) the spindle hole doesn't
        // punch through the glyphs.
        <text
          x="100"
          y="82"
          textAnchor="middle"
          dominantBaseline="central"
          fill="#3D2817"
          fontSize="11"
          fontWeight="900"
          fontFamily="ui-sans-serif, system-ui, sans-serif"
          letterSpacing="-0.3"
        >
          SD
        </text>
      )}

      {effectiveStyle === "tick" && (
        // Small dark wedge at the 12 o'clock position on the label.
        // The minimal option — no text, just an asymmetric notch.
        // Reads cleanly at every size including the home-card vinyls.
        <polygon points="100,68 96,80 104,80" fill="#3D2817" />
      )}

      {effectiveStyle === "spokes" && (
        // Two short radial spokes at 12 and 6 — clock-tick aesthetic.
        // The pair is 180°-symmetric, so on its own the spin animation
        // hits a "looks identical" frame twice per rotation; the
        // highlight arc above keeps motion visible at those moments.
        <>
          <line
            x1="100"
            y1="68"
            x2="100"
            y2="84"
            stroke="#3D2817"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <line
            x1="100"
            y1="116"
            x2="100"
            y2="132"
            stroke="#3D2817"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </>
      )}

      {/* Center hole — drawn last so it sits ON TOP of any label
          glyph that strays close to the spindle (e.g. the 'D' in the
          monogram). */}
      <circle cx="100" cy="100" r="8" fill={color} />
    </svg>
  );
}
