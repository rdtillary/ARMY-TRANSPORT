"use client";
import { useState } from "react";
import {
  Archive as ArchiveIcon,
  X,
  CheckCircle2,
  Route,
  Clock,
  Gauge,
  Camera,
} from "lucide-react";
import MapView, { type MapMarker } from "@/components/MapView";
import { fmtClock } from "@/lib/session";

type Filter = "all" | "active" | "completed";

export default function ArchivePanel() {
  const [archive, setArchive] = useState<any[] | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [detail, setDetail] = useState<any | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

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
                  <th className="py-2 text-right">Record</th>
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
                    <td className="py-2.5 text-right">
                      <button
                        onClick={() => openTrip(r.tripId)}
                        className="text-[10px] font-extrabold px-3 py-1.5 rounded-lg bg-[#2a361d] border border-[#8b6f2e]/40 text-[#d4c48a] hover:bg-[#33421f] inline-flex items-center gap-1"
                      >
                        <Route size={11} /> VIEW MAP
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
  const path: [number, number][] = (d.path || []).map((p: any) => [p.lat, p.lng]);
  const markers: MapMarker[] = [];
  const start = path[0];
  const end = path[path.length - 1];
  if (start) markers.push({ id: "start", lat: start[0], lng: start[1], label: "START", color: "green" });
  if (end && t.status === "completed") markers.push({ id: "end", lat: end[0], lng: end[1], label: "END", color: "red" });
  if (end && t.status === "active") markers.push({ id: "live", lat: end[0], lng: end[1], label: t.regNo, sub: "live", color: "gold", pulse: true });
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
        <MapView className="h-[360px]" markers={markers} path={path} zoom={13} />
      ) : (
        <div className="h-40 rounded-2xl border border-dashed border-[#8b6f2e]/30 flex items-center justify-center text-xs text-[#8b8064]">
          No GPS route recorded for this trip.
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
