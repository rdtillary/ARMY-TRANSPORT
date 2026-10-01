"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Camera,
  LogIn,
  LogOut,
  Siren,
  X,
  RefreshCw,
  Route,
  Truck,
} from "lucide-react";
import { timeAgo, fmtClock } from "@/lib/session";
import AnprGate from "@/components/AnprGate";

type OpsVehicle = {
  id: number;
  regNo: string;
  type: string;
  unit: string;
  parkStatus: "in" | "out";
  tracking: boolean;
  tripId: number | null;
  driver: string;
  startedAt: string | null;
};
type Incident = { id: number; kind: string; kindLabel: string; message: string; ts: string; regNo: string };
type Photo = {
  id: number;
  direction: string;
  photoUrl: string;
  plateText: string;
  confidence: number;
  ts: string;
  regNo: string;
  type: string;
  driverName: string | null;
};
type OpsState = {
  vehicles: OpsVehicle[];
  incidents: Incident[];
  photos: Photo[];
  totals: { total: number; in: number; out: number; trackingOn: number };
};

export default function MtParkPanel() {
  const [state, setState] = useState<OpsState | null>(null);
  const [auto, setAuto] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [busyId, setBusyId] = useState<number | null>(null);
  const [photoLightbox, setPhotoLightbox] = useState<Photo | null>(null);
  const autoRef = useRef(auto);
  autoRef.current = auto;

  const load = useCallback(async () => {
    try {
      const d = await fetch("/api/ops/state").then((r) => r.json());
      if (d.vehicles) setState(d);
    } catch {
      /* keep last state */
    }
    setNow(Date.now());
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    const c = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(t);
      clearInterval(c);
    };
  }, [load]);

  useEffect(() => {
    if (!auto) return;
    const t = setInterval(async () => {
      if (!autoRef.current) return;
      await fetch("/api/gate/simulate", { method: "POST" });
      load();
    }, 12000);
    return () => clearInterval(t);
  }, [auto, load]);

  const scan = async (vehicleId: number, direction: "in" | "out") => {
    setBusyId(vehicleId);
    await fetch("/api/gate/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vehicleId, direction }),
    });
    await load();
    setBusyId(null);
  };

  const ack = async (id: number) => {
    await fetch("/api/incidents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    load();
  };

  const t = state?.totals;

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-extrabold flex items-center gap-2">
          <Camera size={19} className="text-[#d4c48a]" /> MT PARK OPERATIONS — MIL OPERATOR
        </h2>
        <div className="flex items-center gap-2">
          <AnprGate onScanned={load} />
          <button
          onClick={() => setAuto((a) => !a)}
          className={`flex items-center gap-2 text-xs font-extrabold px-3.5 py-2 rounded-lg border transition ${
            auto
              ? "bg-rose-800/70 border-rose-500/60 text-white"
              : "bg-[#2a361d] border-[#8b6f2e]/40 text-[#d4c48a] hover:bg-[#33421f]"
          }`}
        >
            <RefreshCw size={13} className={auto ? "animate-spin" : ""} />
            {auto ? "AUTO CAMERA SCAN: ON" : "AUTO CAMERA SCAN: OFF"}
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Summary label="Vehicles IN" value={t?.in ?? "—"} tone="text-emerald-300" icon={LogIn} />
        <Summary label="Vehicles OUT" value={t?.out ?? "—"} tone="text-amber-300" icon={LogOut} />
        <Summary label="Total fleet" value={t?.total ?? "—"} tone="text-[#d4c48a]" icon={Truck} />
        <Summary label="Tracking ON" value={t?.trackingOn ?? "—"} tone="text-sky-300" icon={Route} />
        <Summary label="Active alarms" value={state?.incidents.length ?? 0} tone={(state?.incidents.length ?? 0) ? "text-rose-300" : "text-[#8b8064]"} icon={Siren} />
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        {/* Master IN/OUT table */}
        <div className="lg:col-span-2 bg-gradient-to-b from-[#1e2a16] to-[#161f10] border border-[#8b6f2e]/20 rounded-2xl p-4">
          <h3 className="text-sm font-extrabold tracking-widest text-[#d4c48a] mb-3">
            VEHICLE REGISTER — IN / OUT
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wider text-[#8b8064] border-b border-[#8b6f2e]/20">
                  <th className="py-2 pr-2">Vehicle</th>
                  <th className="py-2 pr-2">Driver</th>
                  <th className="py-2 pr-2">Tracking</th>
                  <th className="py-2 pr-2">Park</th>
                  <th className="py-2 text-right">Gate scan</th>
                </tr>
              </thead>
              <tbody>
                {(state?.vehicles ?? []).map((v) => {
                  const alarm = state?.incidents.some((i) => i.regNo === v.regNo);
                  return (
                    <tr key={v.id} className={`border-b border-[#8b6f2e]/10 ${alarm ? "bg-rose-950/20" : ""}`}>
                      <td className="py-2 pr-2">
                        <div className="font-extrabold">{v.regNo}</div>
                        <div className="text-[10px] text-[#8b8064]">{v.type}</div>
                      </td>
                      <td className="py-2 pr-2 text-[#d4c48a] text-xs">{v.driver}</td>
                      <td className="py-2 pr-2">
                        <span
                          className={`text-[10px] font-extrabold uppercase tracking-wider border rounded px-1.5 py-0.5 ${
                            v.tracking
                              ? "text-sky-300 border-sky-600/50 bg-sky-950/30"
                              : "text-[#8b8064] border-[#5d573f]/60"
                          }`}
                        >
                          {v.tracking ? `ON${v.startedAt ? " · " + timeAgo(v.startedAt, now) : ""}` : "OFF"}
                        </span>
                      </td>
                      <td className="py-2 pr-2">
                        <span
                          className={`text-[10px] font-extrabold uppercase tracking-wider border rounded px-1.5 py-0.5 ${
                            v.parkStatus === "in"
                              ? "text-emerald-300 border-emerald-600/50 bg-emerald-950/30"
                              : "text-amber-300 border-amber-600/50 bg-amber-950/30"
                          }`}
                        >
                          {v.parkStatus === "in" ? "IN park" : "OUT"}
                        </span>
                      </td>
                      <td className="py-2 text-right">
                        {v.parkStatus === "in" ? (
                          <button
                            disabled={busyId === v.id}
                            onClick={() => scan(v.id, "out")}
                            className="text-[10px] font-extrabold px-2.5 py-1.5 rounded-md bg-amber-700/80 hover:bg-amber-600 text-white inline-flex items-center gap-1 disabled:opacity-40"
                          >
                            <LogOut size={11} /> SCAN OUT
                          </button>
                        ) : (
                          <button
                            disabled={busyId === v.id}
                            onClick={() => scan(v.id, "in")}
                            className="text-[10px] font-extrabold px-2.5 py-1.5 rounded-md bg-emerald-700/80 hover:bg-emerald-600 text-white inline-flex items-center gap-1 disabled:opacity-40"
                          >
                            <LogIn size={11} /> SCAN IN
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="text-[11px] font-extrabold uppercase tracking-wider text-[#d4c48a]">
                  <td className="pt-3 pr-2" colSpan={2}>
                    TOTAL IN: {t?.in ?? 0} · TOTAL OUT: {t?.out ?? 0}
                  </td>
                  <td className="pt-3 pr-2" colSpan={3}>
                    <span className="float-right">
                      IN {t?.in ?? 0} + OUT {t?.out ?? 0} = {t?.total ?? 0} FLEET
                    </span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Contingencies */}
        <div className="bg-gradient-to-b from-[#1e2a16] to-[#161f10] border border-[#8b6f2e]/20 rounded-2xl p-4">
          <h3 className="text-sm font-extrabold tracking-widest text-[#d4c48a] mb-3 flex items-center gap-2">
            <Siren size={15} /> CONTINGENCY ALARMS
          </h3>
          <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
            {(!state?.incidents || state.incidents.length === 0) && (
              <p className="text-xs text-[#8b8064] py-6 text-center">
                No active contingencies. All vehicles compliant.
              </p>
            )}
            {state?.incidents.map((i) => (
              <div key={i.id} className="rounded-xl border border-rose-700/50 bg-rose-950/30 px-3 py-2.5">
                <div className="flex items-start gap-2">
                  <Siren size={14} className="text-rose-300 mt-0.5 shrink-0 animate-pulse" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] font-extrabold uppercase tracking-wider text-rose-300">
                      {i.kindLabel}
                    </div>
                    <p className="text-xs font-bold leading-snug mt-0.5">{i.message}</p>
                    <p className="text-[10px] text-[#8b8064] mt-1">{timeAgo(i.ts, now)}</p>
                  </div>
                  <button
                    onClick={() => ack(i.id)}
                    className="text-[10px] font-extrabold text-emerald-300 border border-emerald-600/40 rounded px-1.5 py-1 hover:bg-emerald-900/30 shrink-0"
                  >
                    ACK
                  </button>
                </div>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-[#6d6349] mt-3 leading-relaxed">
            Rules are automatic: OUT without tracking · tracking ON while inside after 5 min ·
            tracking stopped while OUT (repeats every 1 min) · auto-stop 2 min after scanning IN.
          </p>
        </div>
      </div>

      {/* Camera feed */}
      <div className="bg-gradient-to-b from-[#1e2a16] to-[#161f10] border border-[#8b6f2e]/20 rounded-2xl p-4">
        <h3 className="text-sm font-extrabold tracking-widest text-[#d4c48a] mb-3 flex items-center gap-2">
          <Camera size={15} /> LATEST GATE CAMERA CAPTURES — ANPR
        </h3>
        {(!state?.photos || state.photos.length === 0) && (
          <div className="text-center py-10">
            <Camera size={34} className="mx-auto text-[#4a3a1a] mb-2" />
            <p className="text-xs text-[#8b8064]">
              No captures yet. Press <b>SCAN OUT / SCAN IN</b> in the table, or switch on
              <b> Auto Camera Scan</b> to simulate the ANPR camera.
            </p>
          </div>
        )}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
          {state?.photos.map((p) => (
            <button
              key={p.id}
              onClick={() => setPhotoLightbox(p)}
              className="text-left rounded-xl overflow-hidden border border-[#8b6f2e]/25 bg-[#141c0e] hover:border-[#c0a86c]/60 transition"
            >
              <div className="relative h-32">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.photoUrl} alt={p.plateText} className="w-full h-full object-cover" />
                <span
                  className={`absolute top-1.5 left-1.5 text-[9px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                    p.direction === "out" ? "bg-amber-600 text-white" : "bg-emerald-700 text-white"
                  }`}
                >
                  {p.direction === "out" ? "▶ EXIT" : "◀ ENTRY"}
                </span>
                <span className="absolute top-1.5 right-1.5 text-[9px] font-bold bg-black/70 text-emerald-300 px-1.5 py-0.5 rounded">
                  ANPR ✓ {p.confidence.toFixed(1)}%
                </span>
              </div>
              <div className="p-2">
                <div className="font-extrabold text-sm tracking-wide">{p.plateText}</div>
                <div className="text-[10px] text-[#8b8064] truncate">{p.type}</div>
                <div className="flex items-center justify-between text-[10px] text-[#a89a76] mt-1">
                  <span>{p.driverName && p.driverName !== "—" ? p.driverName : "no driver"}</span>
                  <span>{fmtClock(p.ts)}</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Photo lightbox */}
      {photoLightbox && (
        <div className="fixed inset-0 z-[1000] bg-black/80 flex items-center justify-center p-4" onClick={() => setPhotoLightbox(null)}>
          <div className="bg-[#161f10] border border-[#8b6f2e]/40 rounded-2xl overflow-hidden max-w-2xl w-full" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoLightbox.photoUrl} alt={photoLightbox.plateText} className="w-full max-h-[60vh] object-cover" />
            <div className="p-4 flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-extrabold">{photoLightbox.plateText}</div>
                <div className="text-xs text-[#a89a76]">
                  {photoLightbox.type} · {photoLightbox.direction.toUpperCase()} capture ·{" "}
                  {new Date(photoLightbox.ts).toLocaleString()}
                </div>
                <div className="text-[11px] text-emerald-300 mt-1">
                  Plate read confidence {photoLightbox.confidence.toFixed(1)}%
                </div>
              </div>
              <button onClick={() => setPhotoLightbox(null)} className="p-2 rounded-lg border border-[#4a3a2a]/50 text-[#a89a76] hover:text-white">
                <X size={16} />
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function Summary({ label, value, tone, icon: Icon }: any) {
  return (
    <div className="bg-gradient-to-br from-[#1e2a16] to-[#161f10] border border-[#8b6f2e]/15 rounded-2xl p-4">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-[#a89a76] font-bold">
        <Icon size={12} /> {label}
      </div>
      <div className={`text-3xl font-extrabold mt-1.5 ${tone}`}>{value}</div>
    </div>
  );
}
