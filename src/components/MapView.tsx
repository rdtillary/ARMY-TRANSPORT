"use client";
import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap, Marker as LeafletMarker, Polyline as LeafletPolyline } from "leaflet";
import "leaflet/dist/leaflet.css";

export type MapMarker = {
  id: string;
  lat: number | null;
  lng: number | null;
  label: string;
  sub?: string;
  color: "green" | "amber" | "red" | "gold";
  pulse?: boolean;
};

const GOOGLE_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";

let googlePromise: Promise<any> | null = null;
function loadGoogle(): Promise<any> {
  const w = window as any;
  if (w.google?.maps) return Promise.resolve(w.google.maps);
  if (googlePromise) return googlePromise;
  googlePromise = new Promise((resolve, reject) => {
    const finish = () => {
      if (w.google?.maps) resolve(w.google.maps);
      else reject(new Error("Google Maps did not initialize"));
    };
    w.__atcMapsReady = finish;
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
      GOOGLE_KEY
    )}&v=weekly&callback=__atcMapsReady`;
    s.async = true;
    s.onerror = () => reject(new Error("Google Maps script failed to load"));
    document.head.appendChild(s);
    setTimeout(() => reject(new Error("Google Maps load timeout")), 15000);
  });
  return googlePromise;
}

function markerHtml(m: MapMarker) {
  const sub = m.sub ? `<i>${m.sub}</i>` : "";
  return `<div class="vmarker vm-${m.color}${m.pulse ? " vm-pulse" : ""}"><span class="vdot"></span><span class="vtag">${m.label}${sub}</span></div>`;
}

type Engine =
  | { kind: "google"; gmaps: any; map: any; markers: Map<string, any>; line: any }
  | { kind: "leaflet"; map: LeafletMap; L: any; markers: Map<string, LeafletMarker>; line: LeafletPolyline | null };

export default function MapView({
  markers = [],
  path = [],
  center = [28.645, 77.225],
  zoom = 13,
  className = "h-[420px]",
  followId = null,
}: {
  markers?: MapMarker[];
  path?: [number, number][];
  center?: [number, number];
  zoom?: number;
  className?: string;
  followId?: string | null;
}) {
  const elRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const [ready, setReady] = useState(0);
  const [error, setError] = useState<string | null>(null);

  /* Create the map once (client only — Leaflet is imported dynamically). */
  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    let cancelled = false;
    let engine: Engine | null = null;

    const done = (e: Engine) => {
      engine = e;
      engineRef.current = e;
      if (!cancelled) setReady((r) => r + 1);
    };

    const initLeaflet = async () => {
      try {
        // Dynamic import: Leaflet is browser-only and must never run on the server.
        const mod = await import("leaflet");
        const L = mod.default;
        if (cancelled || !elRef.current) return;
        const map = L.map(elRef.current, { center: [center[0], center[1]], zoom });
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: "&copy; OpenStreetMap contributors",
        }).addTo(map);
        done({ kind: "leaflet", map, L, markers: new Map(), line: null });
      } catch {
        if (!cancelled) setError("Map failed to initialize");
      }
    };

    const initGoogle = async () => {
      try {
        const gmaps = await loadGoogle();
        if (cancelled || !elRef.current) return;
        const map = new gmaps.Map(elRef.current, {
          center: { lat: center[0], lng: center[1] },
          zoom,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
          clickableIcons: false,
          backgroundColor: "#0d120b",
        });
        done({ kind: "google", gmaps, map, markers: new Map(), line: null });
      } catch {
        if (!cancelled)
          setError("Google Maps unavailable — check NEXT_PUBLIC_GOOGLE_MAPS_API_KEY in .env");
      }
    };

    if (GOOGLE_KEY) initGoogle();
    else initLeaflet();

    return () => {
      cancelled = true;
      const eng = engineRef.current;
      if (eng?.kind === "leaflet") eng.map.remove();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Keep markers in sync with incoming data. */
  useEffect(() => {
    const eng = engineRef.current;
    if (!eng) return;
    const seen = new Set<string>();
    for (const m of markers) {
      if (m.lat == null || m.lng == null || !isFinite(m.lat) || !isFinite(m.lng)) continue;
      seen.add(m.id);
      const html = markerHtml(m);
      if (eng.kind === "google") {
        const pos = { lat: m.lat, lng: m.lng };
        const icon = new eng.gmaps.divIcon({
          html,
          iconSize: new eng.gmaps.Size(0, 0),
          iconAnchor: new eng.gmaps.Point(0, 0),
        });
        const existing = eng.markers.get(m.id);
        if (existing) {
          existing.setPosition(pos);
          existing.setIcon(icon);
        } else {
          const mk = new eng.gmaps.Marker({ position: pos, icon, map: eng.map, title: m.label });
          eng.markers.set(m.id, mk);
        }
      } else {
        const L = eng.L;
        const icon = L.divIcon({ html, className: "", iconSize: [0, 0], iconAnchor: [0, 0] });
        const existing = eng.markers.get(m.id);
        if (existing) {
          existing.setLatLng([m.lat, m.lng]);
          existing.setIcon(icon);
        } else {
          const mk = L.marker([m.lat, m.lng], { icon }).addTo(eng.map);
          eng.markers.set(m.id, mk);
        }
      }
    }
    for (const [id, mk] of Array.from(eng.markers.entries())) {
      if (!seen.has(id)) {
        if (eng.kind === "google") mk.setMap(null);
        else mk.remove();
        eng.markers.delete(id);
      }
    }
    /* Optionally follow a specific vehicle. */
    if (followId) {
      const m = markers.find((x) => x.id === followId);
      const lat = m?.lat;
      const lng = m?.lng;
      if (m && lat != null && lng != null) {
        if (eng.kind === "google") eng.map.panTo({ lat, lng });
        else eng.map.setView([lat, lng], Math.max(eng.map.getZoom(), 14), { animate: true });
      }
    }
  }, [markers, ready, followId]);

  /* Draw the trip route polyline (archive view). */
  useEffect(() => {
    const eng = engineRef.current;
    if (!eng) return;
    if (path.length < 2) {
      if (eng.kind === "google" && eng.line) {
        eng.line.setMap(null);
        eng.line = null;
      } else if (eng.kind === "leaflet" && eng.line) {
        eng.line.remove();
        eng.line = null;
      }
      return;
    }
    if (eng.kind === "google") {
      if (eng.line) eng.line.setMap(null);
      eng.line = new eng.gmaps.Polyline({
        path: path.map(([lat, lng]) => ({ lat, lng })),
        geodesic: true,
        strokeColor: "#d4a017",
        strokeOpacity: 0.95,
        strokeWeight: 4,
      });
      eng.line.setMap(eng.map);
      const bounds = new eng.gmaps.LatLngBounds();
      path.forEach(([lat, lng]) => bounds.extend({ lat, lng }));
      eng.map.fitBounds(bounds, 60);
    } else {
      if (eng.line) eng.line.remove();
      const line = eng.L.polyline(path, {
        color: "#d4a017",
        weight: 4,
        opacity: 0.95,
      }).addTo(eng.map) as LeafletPolyline;
      eng.line = line;
      eng.map.fitBounds(line.getBounds(), { padding: [50, 50] });
    }
  }, [path, ready]);

  return (
    <div className={`relative ${className} rounded-2xl overflow-hidden border border-[#8b6f2e]/25 bg-[#0d120b]`}>
      <div ref={elRef} className="absolute inset-0" />
      {error && (
        <div className="absolute inset-0 z-[700] flex items-center justify-center bg-[#0d120b]/95">
          <p className="text-sm text-[#b5aa88] px-6 text-center">{error}</p>
        </div>
      )}
      {!GOOGLE_KEY && !error && (
        <div className="absolute bottom-2 left-2 z-[650] bg-[#161f10]/90 border border-[#8b6f2e]/30 rounded-lg px-3 py-1.5 text-[10px] text-[#b5aa88] pointer-events-none">
          LIVE MAP — OpenStreetMap fallback (set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to use Google Maps)
        </div>
      )}
    </div>
  );
}
