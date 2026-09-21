import type { GeoPos } from "./geo";

/** HQ base position (Delhi ring-road area). */
export const BASE_POS: [number, number] = [28.6315, 77.2167];

/** Loop of waypoints around the base used by the demo/simulation GPS. */
const ROUTE: [number, number][] = [
  [28.6315, 77.2167],
  [28.636, 77.224],
  [28.641, 77.232],
  [28.6455, 77.24],
  [28.65, 77.243],
  [28.656, 77.241],
  [28.661, 77.235],
  [28.664, 77.226],
  [28.662, 77.216],
  [28.656, 77.209],
  [28.648, 77.205],
  [28.64, 77.206],
  [28.634, 77.211],
];

/**
 * Returns a generator producing plausible GPS fixes that drive a vehicle
 * around the demo route. Used for demos on machines without real GPS,
 * or when permission is denied.
 */
export function createSimulator(step = 0.05): () => GeoPos {
  let progress = 0;
  let speed = 42;
  return () => {
    speed = Math.min(64, Math.max(26, speed + (Math.random() - 0.5) * 9));
    const n = ROUTE.length - 1;
    progress = (progress + step) % (n + 1);
    const i = Math.floor(progress);
    const t = progress - i;
    const a = ROUTE[i];
    const b = ROUTE[(i + 1) % ROUTE.length];
    const lat = a[0] + (b[0] - a[0]) * t;
    const lng = a[1] + (b[1] - a[1]) * t;
    const heading = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
    return {
      lat,
      lng,
      speed,
      heading: (heading + 360) % 360,
      accuracy: 8 + Math.random() * 7,
    };
  };
}
