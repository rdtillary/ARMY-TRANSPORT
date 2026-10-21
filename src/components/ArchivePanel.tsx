"use client";
import { useMemo, useState } from "react";
import {
  Archive as ArchiveIcon,
  X,
  CheckCircle2,
  Route,
  Clock,
  Gauge,
  Camera,
  Trash2,
  MapPin,
} from "lucide-react";
import MapView, { type MapMarker } from "@/components/MapView";
import { fmtClock } from "@/lib/session";
import { CAMPUS_PLACES, type CampusPlace } from "@/lib/campusPlaces";

type Filter = "all" | "active" | "completed";

/** A building counts as "passed" if the route came within this many metres of it. */
const PASS_RADIUS_M = 80;

type RoutePt = { lat: number; lng: number; ts: string | number };
type AreaPassed = { place: CampusPlace; distM: number; ts: number };

/**
 * Which named campus buildings did this trip pass?
 * Uses the distance from each building to the nearest route SEGMENT (not just
 * the nearest GPS point), so sparse/decimated points cannot cause a miss.
 */
function computeAreasPassed(pts: RoutePt[], places: CampusPlace[]): AreaPassed[] {
  if (pts.length === 0) return [];
  const out: AreaPassed[] = [];

  for (const pl of places) {
    const kLat = 111320;
    const kLng = 111320 * Math.cos((pl.lat * Math.PI) / 180);
    // route points relative to the building (building = origin), in metres
    const rel = pts.map((p) => ({
      x: (p.lng - pl.lng) * kLng,
      y: (p.lat - pl.lat) * kLat,
      ts: new Date(p.ts).getTime(),
    }));

    let best = Infinity;
    let bestTs = rel[0].ts;

    if (rel.length === 1) {
      best = Math.hypot(rel[0].x, rel[0].y);
    } else {
      for (let i = 0; i < rel.length - 1; i++) {
        const a = rel[i];
        const b = rel[i + 1];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len2 = dx * dx + dy * dy;
        const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(a.x * dx + a.y * dy) / len2));
        const d = Math.hypot(a.x + t * dx, a.y + t * dy);
        if (d < best) {
          best = d;
          bestTs = a.ts + (b.ts - a.ts) * t; // time of closest approach
        }
      }
    }

    if (best <= PASS_RADIUS_M) out.push({ place: pl, distM: best, ts: bestTs });
  }

  return out.sort((a, b) => a.ts - b.ts); // in the order the vehicle passed them
}

export default function ArchivePanel() {
  const [archive, setArchive] = useState<any[] | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [detail, setDetail] = useState<any | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);

  const load = async (f: Filter = filter) => {
    const d = await fetch(`/api/trips/archive?status=${f}`).then((r) => r.json());
    setArchive(d.trips || []);
    setFilter(f);
  };

  const openTrip = async (tripId: number) => {
    setDetail(null);
    setDetailLoading(true);
    const d = await fetch(`/api/trips/${tripId}`).then((r) => r.json());
    setDetail(d);
    setDetailLoading(false);
  };

  const deleteTrip = async (tripId: number) => {
    if (!confirm("Are you sure you want to delete this trip record? This action cannot be undone.")) {
      return;
    }
    setDeleting(tripId);
    try {
      const res = await fetch(`/api/trips/${tripId}`, { method: "DELETE" });
      if (res.ok) {
        await load(filter);
      } else {
        const d = await res.json().catch(() => ({}));
        alert(d.error || "Failed to delete trip");
      }
    } catch (e) {
      alert("Error deleting trip");
    } finally {
      setDeleting(null);
    }
  };

  return (
    <section className="space-y-4">
      <div className="bg-gradient-to-b from-[#1e2a16] to-[#161f10] border border-[#8b6f2e]/20 rounded-2xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 className="text-lg font-extrabold flex items-center gap-2">
            <ArchiveIcon size={19} className="text-[#d4c48a]" /> TRIP ARCHIVE — FULL TRACKING HISTORY
          </h2>
          <div className="flex items-center gap-2">
            <div className="flex bg-[#141c0e] border border-[#8b6f2e]/25 rounded-lg p-0.5">
              {(["all", "active", "completed"] as Filter[]).map((f) => (
                <button
                  key={f}
                  onClick={() => load(f)}
                  className={`px-3 py-1.5 rounded-md text-[11px] font-extrabold uppercase tracking-wider transition ${
                    filter === f && archive !== null ? "bg-[#8b6f2e] text-[#1a1508]" : "text-[#a89a76]"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
            <button
              onClick={() => load()}
              className="text-xs font-extrabold px-4 py-2 rounded-lg bg-[#8b6f2e] text-[#1a1508] hover:brightness-110"
            >
              LOAD ARCHIVE
            </button>
          </div>
        </div>

        {archive === null ? (
          <p className="text-xs text-[#8b8064] py-6 text-center">
            Press LOAD ARCHIVE to retrieve every stored trip with GPS routes, maps, timings, gate scans and contingencies.
          </p>
        ) : archive.length === 0 ? (
          <p className="text-xs text-[#8b8064] py-6 text-center">No trips in this view yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wider text-[#8b8064] border-b border-[#8b6f2e]/20">
                  <th className="py-2 pr-3">Vehicle</th>
                  <th className="py-2 pr-3">Driver</th>
                  <th className="py-2 pr-3">Started</th>
                  <th className="py-2 pr-3">Ended</th>
                  <th className="py-2 pr-3">Distance</th>
                  <th className="py-2 pr-3">GPS pts</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {archive.map((r) => (
                  <tr key={r.tripId} className="border-b border-[#8b6f2e]/10 hover:bg-[#8b6f2e]/5">
                    <td className="py-2.5 pr-3 font-extrabold">{r.regNo}<div className="text-[10px] text-[#8b8064] font-medium">{r.type}</div></td>
                    <td className="py-2.5 pr-3 text-xs">{r.driverName}</td>
                    <td className="py-2.5 pr-3 text-xs whitespace-nowrap">{new Date(r.startedAt).toLocaleString()}</td>
                    <td className="py-2.5 pr-3 text-xs whitespace-nowrap">{r.endedAt ? new Date(r.endedAt).toLocaleString() : "—"}</td>
                    <td className="py-2.5 pr-3 text-xs">{r.distanceKm} km</td>
                    <td className="py-2.5 pr-3 text-xs">{r.points}</td>
                    <td className="py-2.5 pr-3">
                      <span className={`text-[10px] font-extrabold uppercase border rounded px-1.5 py-0.5 ${r.status === "active" ? "text-sky-300 border-sky-600/50" : "text-[#8b8064] border-[#5d573f]/60"}`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="py-2.5 text-right flex justify-end gap-2">
                      <button
                        onClick={() => openTrip(r.tripId)}
                        className="text-[10px] font-extrabold px-3 py-1.5 rounded-lg bg-[#2a361d] border border-[#8b6f2e]/40 text-[#d4c48a] hover:bg-[#33421f] inline-flex items-center gap-1"
                      >
                        <Route size={11} /> VIEW
                      </button>
                      <button
                        onClick={() => deleteTrip(r.tripId)}
                        disabled={deleting === r.tripId}
                        className="text-[10px] font-extrabold px-3 py-1.5 rounded-lg bg-rose-950/40 border border-rose-700/40 text-rose-300 hover:bg-rose-900/50 disabled:opacity-50 inline-flex items-center gap-1"
                      >
                        <Trash2 size={11} /> DELETE
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {(detailLoading || detail) && (
        <div className="fixed inset-0 z-[1000] bg-black/75 flex items-center justify-center p-4" onClick={() => { setDetail(null); setDetailLoading(false); }}>
          <div
            className="bg-[#161f10] border border-[#8b6f2e]/40 rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto p-5"
            onClick={(e) => e.stopPropagation()}
          >
            {detailLoading && <div className="py-20 text-center text-sm text-[#a89a76]">Loading trip record…</div>}
            {detail && <TripDetail d={detail} onClose={() => setDetail(null)} />}
          </div>
        </div>
      )}
    </section>
  );
}

function TripDetail({ d, onClose }: { d: any; onClose: () => void }) {
  const t = d.trip;

  // Route as lat/lng pairs for the polyline (memoised so the map is not redrawn needlessly)
  const path: [number, number][] = useMemo(
    () => (d.path || []).map((p: any) => [p.lat, p.lng] as [number, number]),
    [d.path]
  );

  // Which named buildings did this vehicle pass?
  const areasPassed = useMemo(
    () => computeAreasPassed((d.path || []) as RoutePt[], CAMPUS_PLACES),
    [d.path]
  );

  // Buildings NOT passed stay as plain gold labels; passed ones become green markers (below)
  const otherPlaces = useMemo(() => {
    const passed = new Set(areasPassed.map((a) => a.place.name));
    return CAMPUS_PLACES.filter((p) => !passed.has(p.name));
  }, [areasPassed]);

  const markers: MapMarker[] = [];
  const start = path[0];
  const end = path[path.length - 1];
  if (start) markers.push({ id: "start", lat: start[0], lng: start[1], label: "START", color: "green" });
  if (end && t.status === "completed") markers.push({ id: "end", lat: end[0], lng: end[1], label: "END", color: "red" });
  if (end && t.status === "active") markers.push({ id: "live", lat: end[0], lng: end[1], label: t.regNo, sub: "live", color: "gold", pulse: true });
  for (const a of areasPassed) {
    markers.push({
      id: `pass-${a.place.name}`,
      lat: a.place.lat,
      lng: a.place.lng,
      label: a.place.name,
      sub: fmtClock(a.ts),
      color: "green",
    });
  }

  const durMin = Math.round(t.durationSec / 60);

  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h4 className="text-xl font-extrabold">{t.regNo} <span className="text-sm text-[#8b8064] font-medium">· {t.type}</span></h4>
          <p className="text-xs text-[#a89a76] mt-0.5">{t.driverName} ({t.driverServiceNo}) · {t.unit}</p>
        </div>
        <button onClick={onClose} className="p-2 rounded-lg border border-[#4a3a2a]/50 text-[#a89a76] hover:text-white">
          <X size={16} />
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
        <Stat icon={Clock} k="Status" v={t.status} />
        <Stat icon={Clock} k="Duration" v={`${durMin} min`} />
        <Stat icon={Route} k="Distance" v={`${t.distanceKm} km`} />
        <Stat icon={Gauge} k="Max speed" v={`${t.maxSpeedKmh} km/h`} />
        <Stat icon={CheckCircle2} k="Started" v={new Date(t.startedAt).toLocaleString()} />
        <Stat icon={CheckCircle2} k="Ended" v={t.endedAt ? new Date(t.endedAt).toLocaleString() : "in progress"} />
        <Stat icon={Route} k="GPS points" v={String(t.pointCount)} />
        <Stat icon={Camera} k="Gate scans" v={String(d.gates?.length ?? 0)} />
      </div>

      {path.length >= 2 ? (
        <MapView className="h-[360px]" markers={markers} path={path} zoom={13} places={otherPlaces} />
      ) : (
        <div className="h-40 rounded-2xl border border-dashed border-[#8b6f2e]/30 flex items-center justify-center text-xs text-[#8b8064]">
          No GPS route recorded for this trip.
        </div>
      )}

      {/* Areas passed */}
      {path.length >= 2 && (
        <div className="mt-4">
          <h5 className="text-xs font-extrabold tracking-widest text-[#d4c48a] mb-2 flex items-center gap-1.5">
            <MapPin size={12} /> AREAS PASSED ({areasPassed.length})
            <span className="text-[10px] font-medium text-[#8b8064] tracking-normal normal-case">
              · within {PASS_RADIUS_M} m of the route, in order of passing
            </span>
          </h5>
          {areasPassed.length === 0 ? (
            <p className="text-xs text-[#8b8064] bg-[#141c0e] border border-[#8b6f2e]/15 rounded-xl px-3 py-2.5">
              This trip did not pass any named campus building.
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-x-1 gap-y-1.5">
              {areasPassed.map((a, i) => (
                <span key={a.place.name} className="flex items-center gap-1">
                  <span
                    title={`closest approach ${Math.round(a.distM)} m`}
                    className="text-[10px] font-bold px-2 py-0.5 rounded-md border bg-emerald-400/10 border-emerald-400/50 text-emerald-300"
                  >
                    {a.place.name}
                    <i className="not-italic font-normal text-[9px] opacity-70 ml-1">{fmtClock(a.ts)}</i>
                  </span>
                  {i < areasPassed.length - 1 && <span className="text-[#5d573f] text-[10px]">→</span>}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {d.gates?.length > 0 && (
        <div className="mt-4">
          <h5 className="text-xs font-extrabold tracking-widest text-[#d4c48a] mb-2">GATE SCANS DURING TRIP</h5>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {d.gates.map((g: any) => (
              <div key={g.id} className="rounded-lg overflow-hidden border border-[#8b6f2e]/25">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={g.photoUrl} alt="" className="w-full h-20 object-cover" />
                <div className="p-1.5 text-[10px]">
                  <span className={`font-extrabold ${g.direction === "out" ? "text-amber-300" : "text-emerald-300"}`}>
                    {g.direction.toUpperCase()}
                  </span>{" "}
                  · {fmtClock(g.ts)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {d.incidents?.length > 0 && (
        <div className="mt-4">
          <h5 className="text-xs font-extrabold tracking-widest text-rose-300 mb-2">CONTINGENCIES</h5>
          <div className="space-y-1.5">
            {d.incidents.map((i: any) => (
              <div key={i.id} className="text-xs bg-rose-950/30 border border-rose-800/40 rounded-lg px-3 py-2 flex items-center justify-between gap-2">
                <span>{i.message}</span>
                <span className="text-[10px] text-[#8b8064] shrink-0">{new Date(i.ts).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ icon: Icon, k, v }: any) {
  return (
    <div className="bg-[#141c0e] border border-[#8b6f2e]/15 rounded-xl px-3 py-2">
      <div className="text-[9px] uppercase tracking-widest text-[#8b8064] flex items-center gap-1">
        <Icon size={10} /> {k}
      </div>
      <div className="text-xs font-bold mt-0.5 break-words">{v}</div>
    </div>
  );
}
