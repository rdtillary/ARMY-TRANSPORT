/* Indian Army circular insignia — official vector-sourced asset, never redrawn.
   Transparent 1024px PNG at public/mcte-logo.png;
   original vector source kept at public/indian-army-logo-original.svg. */
export default function McteLogo({
  size = 64,
  className = "",
}: {
  size?: number;
  className?: string;
  withRing?: boolean;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/mcte-logo.png"
      width={size}
      height={size}
      alt="Indian Army insignia"
      draggable={false}
      className={`select-none ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
