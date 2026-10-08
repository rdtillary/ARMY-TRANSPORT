import type { GeoPos } from "./geo";

/** MT Park base position (Indore, Madhya Pradesh). */
export const BASE_POS: [number, number] = [22.541239, 75.765815];

/** Loop of waypoints around the base used by the demo/simulation GPS. */
const ROUTE: [number, number][] = [
  [22.541239, 75.765815],
  [22.542, 75.767],
  [22.543, 75.769],
  [22.544, 75.7705],
  [22.545, 75.771],
  [22.546, 75.7695],
  [22.547, 75.768],
  [22.5465, 75.766],
  [22.545, 75.764],
  [22.543, 75.763],
  [22.542, 75.765],
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
