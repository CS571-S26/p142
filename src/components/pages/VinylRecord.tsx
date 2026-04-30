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
}

export function VinylRecord({ color, size = 200, className }: VinylRecordProps) {
  // When a className is provided, leave width/height off so Tailwind's
  // size-* utilities can take over. Otherwise pin to the numeric size.
  const sized = className ? {} : { width: size, height: size };

  return (
    // Purely decorative — the playlist name (or whatever the vinyl is
    // visualizing) is always rendered as text right next to the SVG, so
    // exposing it to assistive tech would just make screen readers say
    // "image" before every playlist card. aria-hidden + role="img"
    // omitted means screen readers ignore it entirely.
    <svg
      {...sized}
      className={className}
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

      {/* Label */}
      <circle cx="100" cy="100" r="35" fill="white" />

      {/* Center hole */}
      <circle cx="100" cy="100" r="8" fill={color} />

      {/* Label text rings */}
      <circle cx="100" cy="100" r="30" fill="none" stroke="#e0e0e0" strokeWidth="0.5" />
      <circle cx="100" cy="100" r="25" fill="none" stroke="#e0e0e0" strokeWidth="0.5" />
      <circle cx="100" cy="100" r="20" fill="none" stroke="#e0e0e0" strokeWidth="0.5" />
      <circle cx="100" cy="100" r="15" fill="none" stroke="#e0e0e0" strokeWidth="0.5" />
    </svg>
  );
}
