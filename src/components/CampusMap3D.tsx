"use client";
import { useEffect, useRef, useState } from "react";

/**
 * 3D campus map (MapLibre GL + OpenFreeMap vector tiles with extruded
 * buildings). No API key is needed. MapLibre is loaded from a CDN at runtime,
 * so there is no extra npm dependency to build.
 *
 * Centre: 22°32'09.3"N 75°45'37.6"E
 */
export const CAMPUS_CENTER: [number, number] = [75.760444, 22.535917]; // [lng, lat]

const MAPLIBRE_VERSION = "4.7.1";
const JS_URL = `https://cdn.jsdelivr.net/npm/maplibre-gl@${MAPLIBRE_VERSION}/dist/maplibre-gl.js`;
const CSS_URL = `https://cdn.jsdelivr.net/npm/maplibre-gl@${MAPLIBRE_VERSION}/dist/maplibre-gl.css`;
const STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

const HOME_VIEW = { center: CAMPUS_CENTER, zoom: 17, pitch: 60, bearing: -20 };

let libPromise: Promise<any> | null = null;
function loadMapLibre(): Promise<any> {
  const w = window as any;
  if (w.maplibregl) return Promise.resolve(w.maplibregl);
  if (libPromise) return libPromise;
  libPromise = new Promise((resolve, reject) => {
    if (!document.getElementById("maplibre-css")) {
      const l = document.createElement("link");
      l.id = "maplibre-css";
      l.rel = "stylesheet";
      l.href = CSS_URL;
      document.head.appendChild(l);
    }
    const s = document.createElement("script");
    s.src = JS_URL;
    s.async = true;
    s.onload = () => (w.maplibregl ? resolve(w.maplibregl) : reject(new Error("MapLibre did not initialize")));
    s.onerror = () => reject(new Error("Could not load the 3D map library (check internet connection)"));
    document.head.appendChild(s);
    setTimeout(() => reject(new Error("3D map library load timeout")), 20000);
  }).catch((e) => {
    libPromise = null; // allow a retry on the next mount
    throw e;
  });
  return libPromise;
}

export default function CampusMap3D({ className = "h-[70vh] min-h-[420px]" }: { className?: string }) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [flat, setFlat] = useState(false);

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    let cancelled = false;
    let map: any = null;
    let ro: ResizeObserver | null = null;

    loadMapLibre()
      .then((ml) => {
        if (cancelled || !elRef.current) return;
        map = new ml.Map({
          container: elRef.current,
          style: STYLE_URL,
          ...HOME_VIEW,
          maxPitch: 80,
          attributionControl: { compact: true },
        });
        mapRef.current = map;

        map.addControl(new ml.NavigationControl({ visualizePitch: true }), "top-right");
        map.addControl(new ml.ScaleControl({ unit: "metric" }), "bottom-left");

        // Campus centre marker
        // (MapLibre positions the outer element with its own transform, so the
        // styled marker lives in an inner element.)
        const pin = document.createElement("div");
        pin.innerHTML =
          '<div class="vmarker vm-gold vm-pulse"><span class="vdot"></span><span class="vtag">MCTE CAMPUS</span></div>';
        new ml.Marker({ element: pin, anchor: "left" }).setLngLat(CAMPUS_CENTER).addTo(map);

        map.on("load", () => !cancelled && setLoading(false));
        map.on("error", (e: any) => {
          // Tile/style failures: surface them only if the map never came up.
          if (!map.isStyleLoaded() && !cancelled) {
            setError(e?.error?.message || "Map style failed to load");
            setLoading(false);
          }
        });

        ro = new ResizeObserver(() => map?.resize());
        ro.observe(elRef.current);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
      ro?.disconnect();
      map?.remove();
      mapRef.current = null;
    };
  }, []);

  const resetView = () => {
    setFlat(false);
    mapRef.current?.easeTo({ ...HOME_VIEW, duration: 900 });
  };
  const toggleFlat = () => {
    const next = !flat;
    setFlat(next);
    mapRef.current?.easeTo({ pitch: next ? 0 : HOME_VIEW.pitch, bearing: next ? 0 : HOME_VIEW.bearing, duration: 700 });
  };

  return (
    <div className={`relative rounded-xl overflow-hidden border border-[#8b6f2e]/25 bg-[#0d120b] ${className}`}>
      <div ref={elRef} className="absolute inset-0" />

      <div className="absolute top-3 left-3 z-10 flex gap-2">
        <button
          onClick={resetView}
          className="bg-[#141b10]/90 border border-[#8b6f2e]/50 text-[#d4c48a] text-[11px] font-extrabold uppercase tracking-wider px-3 py-2 rounded-lg hover:bg-[#1e2a16]"
        >
          Reset view
        </button>
        <button
          onClick={toggleFlat}
          className="bg-[#141b10]/90 border border-[#8b6f2e]/50 text-[#d4c48a] text-[11px] font-extrabold uppercase tracking-wider px-3 py-2 rounded-lg hover:bg-[#1e2a16]"
        >
          {flat ? "3D view" : "Top view"}
        </button>
      </div>

      {loading && !error && (
        <div className="absolute inset-0 z-10 flex items-center justify-center text-sm text-[#b5aa88] bg-[#0d120b]/70 pointer-events-none">
          Loading 3D campus map…
        </div>
      )}
      {error && (
        <div className="absolute inset-0 z-10 flex items-center justify-center p-6 text-center text-sm text-amber-200 bg-[#0d120b]/90">
          3D map unavailable — {error}
        </div>
      )}
    </div>
  );
}
