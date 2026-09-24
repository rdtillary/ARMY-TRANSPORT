"use client";
import { useCallback, useEffect, useState } from "react";
import { Siren, LogIn, LogOut, Truck, Camera } from "lucide-react";
import { timeAgo, fmtClock } from "@/lib/session";

type State = {
  vehicles: any[];
  incidents: any[];
  photos: any[];
  totals: { total: number; in: number; out: number; trackingOn: number };
} | null;

export default function JcoMtPanel() {
  const [state, setState] = useState<State>(null);
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async () => {
    try {
      const d = await fetch("/api/ops/state").then((r) => r.json());
      if (d.vehicles) setState(d);
    } catch {
      /* ignore */
    }
    setNow(Date.now());
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 6000);
    const c = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(t);
      clearInterval(c);
    };
  }, [load]);

  const t = state?.totals;

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-extrabold flex items-center gap-2">
        <Camera size={19} className="text-[#d4c48a]" /> MT PARK STATUS
      </h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card icon={LogIn} label="IN park" value={t?.in ?? "—"} tone="text-emerald-300" />
        <Card icon={LogOut} label="OUT" value={t?.out ?? "—"} tone="text-amber-300" />
        <Card icon={Truck} label="Total fleet" value={t?.total ?? "—"} tone="text-[#d4c48a]" />
        <Card icon={Siren} label="Contingencies" value={state?.incidents.length ?? 0} tone={(state?.incidents.length ?? 0) ? "text-rose-300" : "text-[#8b8064]"} />
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <div className="bg-gradient-to-b from-[#1e2a16] to-[#161f10] border border-[#8b6f2e]/20 rounded-2xl p-4">
          <h3 className="text-sm font-extrabold tracking-widest text-[#d4c48a] mb-3 flex items-center gap-2">
            <Siren size={15} /> CONTINGENCY ALARMS (shared with control room)
          </h3>
          <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
            {(!state?.incidents || state.incidents.length === 0) && (
              <p className="text-xs text-[#8b8064] py-6 text-center">No active contingencies.</p>
            )}
            {state?.incidents.map((i) => (
              <div key={i.id} className="rounded-xl border border-rose-700/50 bg-rose-950/30 px-3 py-2.5">
                <div className="flex items-start gap-2">
                  <Siren size={14} className="text-rose-300 mt-0.5 shrink-0 animate-pulse" />
                  <div>
                    <div className="text-[10px] font-extrabold uppercase tracking-wider text-rose-300">{i.kindLabel}</div>
                    <p className="text-xs font-bold leading-snug mt-0.5">{i.message}</p>
                    <p className="text-[10px] text-[#8b8064] mt-1">{timeAgo(i.ts, now)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-gradient-to-b from-[#1e2a16] to-[#161f10] border border-[#8b6f2e]/20 rounded-2xl p-4">
          <h3 className="text-sm font-extrabold tracking-widest text-[#d4c48a] mb-3 flex items-center gap-2">
            <Camera size={15} /> LATEST GATE SCANS
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {(state?.photos ?? []).slice(0, 4).map((p) => (
              <div key={p.id} className="rounded-lg overflow-hidden border border-[#8b6f2e]/25 bg-[#141c0e]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.photoUrl} alt={p.plateText} className="w-full h-20 object-cover" />
                <div className="p-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-[11px]">{p.plateText}</span>
                    <span className={`text-[9px] font-extrabold ${p.direction === "out" ? "text-amber-300" : "text-emerald-300"}`}>
                      {p.direction.toUpperCase()}
                    </span>
                  </div>
                  <div className="text-[9px] text-[#8b8064]">{fmtClock(p.ts)}</div>
                </div>
              </div>
            ))}
            {(!state?.photos || state.photos.length === 0) && (
              <p className="text-xs text-[#8b8064] py-6 text-center col-span-2">No gate scans yet.</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function Card({ icon: Icon, label, value, tone }: any) {
  return (
    <div className="bg-gradient-to-br from-[#1e2a16] to-[#161f10] border border-[#8b6f2e]/15 rounded-2xl p-4">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-[#a89a76] font-bold">
        <Icon size={13} /> {label}
      </div>
      <div className={`text-3xl font-extrabold mt-1.5 ${tone}`}>{value}</div>
    </div>
  );
}
