"use client";
import { useEffect, useRef, useState } from "react";
import { CAMPUS_PLACES, PLACE_LABEL_MIN_ZOOM, placeLabelHtml } from "@/lib/campusPlaces";

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

/* ---- DEMO: simulated ANPR cameras (replace with real camera data later) ----
 * Offsets are metres east/north of the campus centre. */
const M_LAT = 1 / 111320;
const M_LNG = 1 / (111320 * Math.cos((CAMPUS_CENTER[1] * Math.PI) / 180));
const DEMO_CAMERAS: { id: string; name: string; dx: number; dy: number }[] = [
  { id: "CAM-01", name: "Main Gate", dx: -230, dy: -210 },
  { id: "CAM-02", name: "Gate 2", dx: 260, dy: -180 },
  { id: "CAM-03", name: "Admin Block", dx: -60, dy: 40 },
  { id: "CAM-04", name: "Parade Ground", dx: 90, dy: 110 },
  { id: "CAM-05", name: "MT Park", dx: 180, dy: -60 },
  { id: "CAM-06", name: "Workshop", dx: 230, dy: 70 },
  { id: "CAM-07", name: "Officers Mess", dx: -150, dy: 150 },
  { id: "CAM-08", name: "Library Road", dx: -20, dy: 210 },
  { id: "CAM-09", name: "Hostel Road", dx: -250, dy: 30 },
  { id: "CAM-10", name: "Sports Complex", dx: 40, dy: -150 },
  { id: "CAM-11", name: "Training Block", dx: 140, dy: 230 },
  { id: "CAM-12", name: "Hospital Road", dx: -110, dy: -70 },
];
const DEMO_VEHICLES = [
  { plate: "05P 016660Y", token: "T-0001" },
  { plate: "03P 015144A", token: "T-0002" },
  { plate: "03D 153861N", token: "T-0003" },
  { plate: "03B 085830P", token: "T-0004" },
  { plate: "09P 031458P", token: "T-0005" },
  { plate: "MP 09 CA 4821", token: "T-0006" },
  { plate: "MP 09 ZD 1175", token: "T-0007" },
  { plate: "03P 015214M", token: "T-0008" },
];
const DOT_LIFETIME_MS = 8000;

export type TrailStop = { camId: string; cam: string; at: number };
export type VehicleTrack = { plate: string; token: string; firstSeen: number; lastSeen: number; count: number; trail: TrailStop[] };
const MAX_TRAIL = 40;
const hhmmss = (t: number) => new Date(t).toLocaleTimeString("en-GB");

export type Detection = { n: number; camId: string; cam: string; plate: string; token: string; at: number };

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

const esc = (v: string) => v.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
const idleHtml = () =>
  '<div class="vmarker vm-gold" style="opacity:.55"><span class="vdot" style="width:8px;height:8px;box-shadow:none"></span></div>';
const detectedHtml = (plate: string, cam: string) =>
  `<div class="vmarker vm-green vm-pulse"><span class="vdot"></span><span class="vtag">${esc(plate)}<i>${esc(cam)}</i></span></div>`;

export default function CampusMap3D({ className = "h-[70vh] min-h-[420px]" }: { className?: string }) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [flat, setFlat] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [feed, setFeed] = useState<Detection[]>([]);
  const [tracks, setTracks] = useState<Record<string, VehicleTrack>>({});
  const camMarkers = useRef<Map<string, { el: HTMLDivElement; timer: ReturnType<typeof setTimeout> | null }>>(new Map());
  const mlRef = useRef<any>(null);

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

        // Building labels (collapse to dots when zoomed far out)
        const placeEls: HTMLElement[] = [];
        for (const pl of CAMPUS_PLACES) {
          const el = document.createElement("div");
          el.style.zIndex = "1";
          el.innerHTML = `<div style="margin-left:-4px">${placeLabelHtml(pl.name, true)}</div>`;
          new ml.Marker({ element: el, anchor: "left" }).setLngLat([pl.lng, pl.lat]).addTo(map);
          placeEls.push(el);
        }
        let labelsOn = true;
        map.on("zoom", () => {
          const on = map.getZoom() >= PLACE_LABEL_MIN_ZOOM;
          if (on === labelsOn) return;
          labelsOn = on;
          for (const el of placeEls) {
            const text = el.querySelector("[data-place]")?.children[1] as HTMLElement | undefined;
            if (text) text.style.display = on ? "" : "none";
          }
        });

        // DEMO camera markers: small dim dot while idle, green pulse on detection
        mlRef.current = ml;
        for (const c of DEMO_CAMERAS) {
          const outer = document.createElement("div");
          outer.title = `${c.id} · ${c.name}`;
          outer.innerHTML = idleHtml();
          new ml.Marker({ element: outer, anchor: "left" })
            .setLngLat([CAMPUS_CENTER[0] + c.dx * M_LNG, CAMPUS_CENTER[1] + c.dy * M_LAT])
            .addTo(map);
          camMarkers.current.set(c.id, { el: outer, timer: null });
        }
        setMapReady(true);

        map.on("load", () => {
          if (cancelled) return;
          map.resize();
          setLoading(false);
        });
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
      camMarkers.current.forEach((m) => m.timer && clearTimeout(m.timer));
      camMarkers.current.clear();
      setMapReady(false);
      ro?.disconnect();
      map?.remove();
      mapRef.current = null;
    };
  }, []);

  /* DEMO: random vehicle detections at random cameras */
  useEffect(() => {
    if (!mapReady) return;
    let n = 0;
    let stopped = false;
    let t: ReturnType<typeof setTimeout>;
    const tick = () => {
      if (stopped) return;
      const cam = DEMO_CAMERAS[Math.floor(Math.random() * DEMO_CAMERAS.length)];
      const veh = DEMO_VEHICLES[Math.floor(Math.random() * DEMO_VEHICLES.length)];
      const m = camMarkers.current.get(cam.id);
      if (m) {
        m.el.innerHTML = detectedHtml(veh.plate, cam.name);
        if (m.timer) clearTimeout(m.timer);
        m.timer = setTimeout(() => {
          m.el.innerHTML = idleHtml();
          m.timer = null;
        }, DOT_LIFETIME_MS);
      }
      const at = Date.now();
      setFeed((f) => [{ n: ++n, camId: cam.id, cam: cam.name, ...veh, at }, ...f].slice(0, 7));
      setTracks((all) => {
        const prev = all[veh.token];
        const trail = prev ? [...prev.trail] : [];
        const last = trail[trail.length - 1];
        // same camera twice in a row = still the same sighting, just refresh its time
        if (last && last.camId === cam.id) trail[trail.length - 1] = { ...last, at };
        else trail.push({ camId: cam.id, cam: cam.name, at });
        return {
          ...all,
          [veh.token]: {
            plate: veh.plate,
            token: veh.token,
            firstSeen: prev?.firstSeen ?? at,
            lastSeen: at,
            count: (prev?.count ?? 0) + 1,
            trail: trail.slice(-MAX_TRAIL),
          },
        };
      });
      t = setTimeout(tick, 1200 + Math.random() * 2300);
    };
    t = setTimeout(tick, 800);
    return () => {
      stopped = true;
      clearTimeout(t);
    };
  }, [mapReady]);

  const resetView = () => {
    setFlat(false);
    mapRef.current?.easeTo({ ...HOME_VIEW, duration: 900 });
  };
  const toggleFlat = () => {
    const next = !flat;
    setFlat(next);
    mapRef.current?.easeTo({ pitch: next ? 0 : HOME_VIEW.pitch, bearing: next ? 0 : HOME_VIEW.bearing, duration: 700 });
  };

  const vehicles = Object.values(tracks).sort((a, b) => b.lastSeen - a.lastSeen);

  return (
    <div>
    <div className={`relative rounded-xl overflow-hidden border border-[#8b6f2e]/25 bg-[#0d120b] ${className}`}>
      {/* Inline style on purpose: MapLibre's own CSS sets .maplibregl-map{position:relative},
          which would beat a Tailwind class and collapse the container to zero height. */}
      <div ref={elRef} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} />

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

      <div className="absolute bottom-3 right-3 z-10 w-[min(290px,calc(100%-24px))] bg-[#0e1409]/90 border border-[#8b6f2e]/40 rounded-xl p-2.5 pointer-events-none">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-300">Camera detections</span>
          <span className="text-[9px] font-bold uppercase tracking-wider text-amber-300 border border-amber-400/40 rounded px-1.5 py-0.5">
            Demo data
          </span>
        </div>
        {feed.length === 0 ? (
          <p className="text-[11px] text-[#8b8064]">Waiting for detections…</p>
        ) : (
          <ul className="space-y-1">
            {feed.map((d) => (
              <li key={d.n} className="flex items-center gap-2 text-[11px] leading-tight">
                <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                <span className="font-extrabold text-[#eee8d0]">{d.plate}</span>
                <span className="text-[#8b8064] truncate">
                  {d.token} · {d.cam}
                </span>
              </li>
            ))}
          </ul>
        )}
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

    {/* Detected vehicles + camera trail */}
    <div className="mt-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs md:text-sm font-extrabold uppercase tracking-wider text-[#d4c48a]">
          Detected vehicles <span className="text-[#8b8064]">({vehicles.length})</span>
        </h3>
        <span className="text-[9px] font-bold uppercase tracking-wider text-amber-300 border border-amber-400/40 rounded px-1.5 py-0.5">
          Demo data
        </span>
      </div>
      {vehicles.length === 0 ? (
        <p className="text-xs text-[#8b8064] bg-[#0e1409]/60 border border-[#8b6f2e]/20 rounded-xl p-4">
          No vehicle detected yet…
        </p>
      ) : (
        <ul className="grid gap-2.5 md:grid-cols-2">
          {vehicles.map((v) => {
            const live = Date.now() - v.lastSeen < DOT_LIFETIME_MS;
            const hidden = v.trail.length > 12 ? v.trail.length - 12 : 0;
            const shown = hidden ? v.trail.slice(-12) : v.trail;
            return (
              <li key={v.token} className="bg-[#0e1409]/70 border border-[#8b6f2e]/25 rounded-xl p-3">
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${live ? "bg-emerald-400" : "bg-[#5d573f]"}`} />
                  <span className="text-sm font-extrabold tracking-wide text-[#eee8d0]">{v.plate}</span>
                  <span className="text-[10px] font-bold text-[#8b8064]">{v.token}</span>
                  <span className="ml-auto text-[10px] text-[#8b8064]">
                    last seen {hhmmss(v.lastSeen)} · {v.count} detections
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-1 gap-y-1.5">
                  {hidden > 0 && <span className="text-[10px] text-[#8b8064]">+{hidden} earlier →</span>}
                  {shown.map((t, i) => {
                    const isLast = i === shown.length - 1;
                    return (
                      <span key={`${t.camId}-${t.at}`} className="flex items-center gap-1">
                        <span
                          title={`${t.camId} · ${hhmmss(t.at)}`}
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                            isLast
                              ? "bg-emerald-400/15 border-emerald-400/60 text-emerald-300"
                              : "bg-[#141b10] border-[#8b6f2e]/30 text-[#b5aa88]"
                          }`}
                        >
                          {t.cam}
                          <i className="not-italic font-normal text-[9px] opacity-70 ml-1">{hhmmss(t.at)}</i>
                        </span>
                        {!isLast && <span className="text-[#5d573f] text-[10px]">→</span>}
                      </span>
                    );
                  })}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
    </div>
  );
}
