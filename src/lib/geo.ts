import { getSession } from "./session";

export type GeoPos = {
  lat: number;
  lng: number;
  speed?: number; // km/h
  heading?: number; // degrees
  accuracy?: number; // meters
  ts?: number; // time the fix was captured (ms since epoch)
};

const BG_PKG = "@capgo/background-geolocation";
const isNative = () =>
  !!(window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.();

/** Find the driver's active trip so the native service knows where to POST. */
async function activeTripId(userId: number): Promise<number | null> {
  try {
    const r = await fetch(`/api/trips?userId=${userId}`);
    const d = await r.json();
    return d?.trip?.id ?? null;
  } catch {
    return null;
  }
}

/** Stop the Android foreground GPS service (safe to call any time). */
export async function stopNativeTracking(): Promise<void> {
  if (typeof window === "undefined" || !isNative()) return;
  try {
    const { BackgroundGeolocation } = await import("@capgo/background-geolocation");
    await BackgroundGeolocation.stop();
  } catch {
    /* plugin not present — nothing to stop */
  }
}

/**
 * Start a continuous GPS watch.
 * - Inside the Android APK it runs a foreground SERVICE that keeps working with
 *   the screen off, the app in the background, or the app swiped away. The
 *   service POSTs every fix straight to the server (no WebView needed).
 *   The JavaScript callback is still used for the on-screen map and the
 *   offline retry queue; the server ignores duplicate points.
 * - Falls back to @capacitor/geolocation (foreground only) if the plugin is missing.
 * - In a plain browser it uses navigator.geolocation.
 * Resolves to a function that stops the watch.
 */
export function startGeoWatch(
  onPos: (p: GeoPos) => void,
  onErr: (msg: string) => void
): Promise<() => void> {
  if (isNative()) {
    return (async () => {
      // 1) Background service (survives screen-off / app closed)
      try {
        const { BackgroundGeolocation } = await import("@capgo/background-geolocation");
        const session = getSession();
        const tripId = session ? await activeTripId(session.id) : null;

        const opts: Record<string, unknown> = {
          backgroundTitle: "Movement tracking ON",
          backgroundMessage: "MCTE Transport is reporting this vehicle's position.",
          requestPermissions: true,
          stale: false,
          distanceFilter: 0,
          minIntervalMs: 5000, // one point every ~5 s, even when parked
          networkFallback: true, // cell/Wi-Fi fix when GPS is silent
        };
        if (tripId && session?.token) {
          opts.url = `${window.location.origin}/api/trips/native-track?tripId=${tripId}`;
          opts.headers = { Authorization: `Bearer ${session.token}` };
        }

        let lastForwarded = 0;
        await BackgroundGeolocation.start(opts as never, (loc, err) => {
          if (err) {
            if (err.code === "NOT_AUTHORIZED") {
              onErr('Location permission needed — set Location to "Allow all the time" in app settings');
              void BackgroundGeolocation.openSettings().catch(() => {});
            } else {
              onErr(err.message || "Native GPS error");
            }
            return;
          }
          if (!loc) return;
          // Throttle the JS side; the native service already uploads on its own.
          const t = loc.time ?? Date.now();
          if (t - lastForwarded < 4000) return;
          lastForwarded = t;
          onPos({
            lat: loc.latitude,
            lng: loc.longitude,
            speed: loc.speed != null && loc.speed >= 0 ? loc.speed * 3.6 : undefined,
            heading: loc.bearing ?? undefined,
            accuracy: loc.accuracy,
            ts: t,
          });
        });
        return () => {
          void BackgroundGeolocation.stop().catch(() => {});
        };
      } catch {
        // plugin missing from this APK — use the foreground-only watcher below
      }

      // 2) Fallback: foreground-only watcher
      const { Geolocation } = await import("@capacitor/geolocation");
      try {
        await Geolocation.requestPermissions({ permissions: ["location"] });
      } catch {
        /* permission prompt unavailable */
      }

      let watchId: string | null = null;
      try {
        watchId = await Geolocation.watchPosition(
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 1000 },
          (e) => {
            if (!e) return;
            const c = e.coords;
            onPos({
              lat: c.latitude,
              lng: c.longitude,
              speed: c.speed != null ? c.speed * 3.6 : undefined,
              heading: c.heading ?? undefined,
              accuracy: c.accuracy,
              ts: e.timestamp ?? Date.now(),
            });
          }
        );
      } catch (e) {
        onErr(e instanceof Error ? e.message : String(e || "Native GPS error"));
        return () => {};
      }

      return () => {
        if (watchId) void Geolocation.clearWatch({ id: watchId }).catch(() => {});
      };
    })().catch((e) => {
      onErr(e instanceof Error ? e.message : String(e || "Native GPS error"));
      return () => {};
    });
  }

  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) {
      onErr("Geolocation not supported on this device");
      resolve(() => {});
      return;
    }

    const id = navigator.geolocation.watchPosition(
      (pos) =>
        onPos({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          speed: pos.coords.speed != null ? pos.coords.speed * 3.6 : undefined,
          heading: pos.coords.heading ?? undefined,
          accuracy: pos.coords.accuracy,
          ts: pos.timestamp ?? Date.now(),
        }),
      (err) => {
        const msgs: Record<number, string> = {
          1: "Location permission denied — allow access or enable simulated GPS",
          2: "Position unavailable",
          3: "GPS timeout — allow access or enable simulated GPS",
        };
        onErr(msgs[err.code] || "GPS error");
      },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 12000 }
    );

    resolve(() => navigator.geolocation.clearWatch(id));
  });
}
