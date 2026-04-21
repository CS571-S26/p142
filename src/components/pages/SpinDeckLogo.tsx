const base = import.meta.env.BASE_URL;

// viewBox is 1157 x 838
const ASPECT = 838 / 1157;

// Disc center in cropped viewBox (451, 250, 1157, 838), expressed as %
// Disc bbox absolute: (471, 270) -> (1552, 1069) -> center (1012, 670)
// Relative to crop: ((1012-451)/1157, (670-250)/838) = (48.5%, 50.1%)
const DISC_ORIGIN = { x: "48.5%", y: "50.1%" };

type Props = {
  /** Width in pixels. Height is derived from the logo's aspect ratio. */
  size?: number;
  /** Spin duration in seconds. Set to 0 to disable the animation. */
  spinSeconds?: number;
  /** Optional className applied to the outer wrapper. */
  className?: string;
};

export function SpinDeckLogo({
  size = 256,
  spinSeconds = 0,
  className = "",
}: Props) {
  const height = Math.round(size * ASPECT);
  const spinStyle =
    spinSeconds > 0
      ? {
          transformOrigin: `${DISC_ORIGIN.x} ${DISC_ORIGIN.y}`,
          animation: `disc-spin ${spinSeconds}s linear infinite`,
        }
      : undefined;

  return (
    <div
      className={`relative inline-block ${className}`}
      style={{ width: size, height }}
    >
      {/* Back: shadow / ground */}
      <img
        src={`${base}spindeck-base.svg`}
        alt=""
        aria-hidden="true"
        className="absolute inset-0 w-full h-full select-none pointer-events-none"
        draggable={false}
      />
      {/* Middle: disc (spins) */}
      <img
        src={`${base}spindeck-disc-only.svg`}
        alt=""
        aria-hidden="true"
        className="absolute inset-0 w-full h-full select-none pointer-events-none"
        style={spinStyle}
        draggable={false}
      />
      {/* Front: arm + cartridge (static) */}
      <img
        src={`${base}spindeck-arm-only.svg`}
        alt="SpinDeck"
        className="absolute inset-0 w-full h-full select-none pointer-events-none"
        draggable={false}
      />
    </div>
  );
}
