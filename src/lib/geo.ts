import { registerPlugin } from "@capacitor/core";

export type GeoPos = {
  lat: number;
  lng: number;
  speed?: number; // km/h
  heading?: number; // degrees
  accuracy?: number; // meters
  ts?: number; // time the fix was captured (ms since epoch)
};

/* ---- Native background watcher (@capacitor-community/background-geolocation) ----
 * Registered by name, so the web build does not need the package installed.
 * The APK build workflow installs it and Android runs it as a foreground
 * service, which keeps GPS alive while the screen is off. */
type BgLocation = {
  latitude: number;
  longitude: number;
  accuracy: number;
  speed: number | null; // m/s
  bearing: number | null;
  time: number | null;
};
type BgError = { code?: string; message?: string };
type BgPlugin = {
  addWatcher(
    opts: {
      backgroundMessage?: string;
      backgroundTitle?: string;
      requestPermissions?: boolean;
      stale?: boolean;
      distanceFilter?: number;
    },
    cb: (loc?: BgLocation, err?: BgError) => void
  ): Promise<string>;
  removeWatcher(opts: { id: string }): Promise<void>;
  openSettings(): Promise<void>;
};
const BackgroundGeolocation = registerPlugin<BgPlugin>("BackgroundGeolocation");

/**
 * Start a continuous GPS watch.
 * - Inside the Capacitor (Android APK) shell it prefers a foreground-service
 *   watcher that keeps reporting with the screen off, and falls back to
 *   @capacitor/geolocation if that plugin is not in the APK.
 * - In a plain browser it falls back to navigator.geolocation.
 * Resolves to a function that stops the watch.
 */
export function startGeoWatch(
  onPos: (p: GeoPos) => void,
  onErr: (msg: string) => void
): Promise<() => void> {
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;

  if (cap?.isNativePlatform?.()) {
    return (async () => {
      // 1) Background-capable watcher
      try {
        const id = await BackgroundGeolocation.addWatcher(
          {
            backgroundTitle: "Movement tracking ON",
            backgroundMessage: "Army Transport is reporting this vehicle's position.",
            requestPermissions: true,
            stale: false,
            distanceFilter: 0,
          },
          (loc, err) => {
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
            onPos({
              lat: loc.latitude,
              lng: loc.longitude,
              speed: loc.speed != null && loc.speed >= 0 ? loc.speed * 3.6 : undefined,
              heading: loc.bearing ?? undefined,
              accuracy: loc.accuracy,
              ts: loc.time ?? Date.now(),
            });
          }
        );
        return () => {
          void BackgroundGeolocation.removeWatcher({ id }).catch(() => {});
        };
      } catch {
        // plugin missing from this APK — use the foreground-only watcher below
      }

      // 2) Fallback: foreground-only watcher
      const { Geolocation } = await import("@capacitor/geolocation");
      try {
        await Geolocation.requestPermissions({ permissions: ["location"] });
      } catch {
        // Android may deny or not expose background permission in some contexts.
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
      {
        enableHighAccuracy: true,
        maximumAge: 1000,
        timeout: 12000,
      }
    );

    resolve(() => navigator.geolocation.clearWatch(id));
  });
}
