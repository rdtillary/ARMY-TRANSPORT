/* Official MCTE formation sign — used as the actual asset, never redrawn.
   Transparent PNG cutout of the official crest (public/mcte-logo.png);
   original source file kept untouched at public/mcte-logo-original.jpg. */
export default function McteLogo({
  size = 64,
  className = "",
}: {
  size?: number;
  className?: string;
  withRing?: boolean;
}) {
  // Source aspect ratio is 244 x 267.
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/mcte-logo.png"
      width={size}
      height={Math.round(size * 1.094)}
      alt="MCTE crest"
      draggable={false}
      className={`select-none ${className}`}
      style={{ width: size, height: Math.round(size * 1.094) }}
    />
  );
}
