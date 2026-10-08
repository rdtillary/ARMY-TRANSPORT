export type GeoPos = {
  lat: number;
  lng: number;
  speed?: number; // km/h
  heading?: number; // degrees
  accuracy?: number; // meters
};

/**
 * Start a continuous GPS watch.
 * - Inside the Capacitor (Android APK) shell it uses @capacitor/geolocation
 *   with battery-safe background location handling.
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
      const { Geolocation } = await import("@capacitor/geolocation");

      try {
        await Geolocation.requestPermissions({ permissions: ["location"] });
      } catch {
        // Android may deny or not expose background permission in some contexts.
      }

      let watchId: string | null = null;

      try {
        watchId = await Geolocation.watchPosition(
          {
            enableHighAccuracy: true,
            timeout: 15000,
            maximumAge: 1000,
          },
          (e) => {
            if (!e) return;
            const c = e.coords;
            onPos({
              lat: c.latitude,
              lng: c.longitude,
              speed: c.speed != null ? c.speed * 3.6 : undefined,
              heading: c.heading ?? undefined,
              accuracy: c.accuracy,
            });
          }
        );
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e || "Native GPS error");
        onErr(errMsg);
        return () => {};
      }

      return () => {
        if (watchId) {
          void Geolocation.clearWatch({ id: watchId }).catch(() => {});
        }
      };
    })().catch((e) => {
      const errMsg = e instanceof Error ? e.message : String(e || "Native GPS error");
      onErr(errMsg);
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
