"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  MonitorCheck,
  Radar,
  ArrowUpRight,
  Truck,
  Fuel,
  FileText,
  Copy,
  Check,
  Radio,
  Gauge,
} from "lucide-react";
import MapView, { type MapMarker } from "@/components/MapView";
import TopBar from "@/components/TopBar";
import JcoMtPanel from "@/components/JcoMtPanel";
import { getSession, timeAgo, type Session } from "@/lib/session";
import { BASE_POS } from "@/lib/simulate";

type Live = {
  vehicles: any[];
  alerts: any[];
  completedToday: number;
  totalVehicles: number;
};

export default function JcoPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [live, setLive] = useState<Live | null>(null);
  const [fleet, setFleet] = useState<any[]>([]);
  const [now, setNow] = useState(Date.now());
  const [copied, setCopied] = useState(false);
  const [broadcast, setBroadcast] = useState<string | null>(null);

  useEffect(() => {
    const s = getSession();
    if (!s || s.role !== "jco") {
      router.replace("/");
      return;
    }
    setSession(s);
  }, [router]);

  useEffect(() => {
    let on = true;
    const load = () => {
      fetch("/api/tracking/live")
        .then((r) => r.json())
        .then((d) => on && setLive(d))
        .catch(() => {});
      fetch("/api/vehicles")
        .then((r) => r.json())
        .then((d) => on && setFleet(d.vehicles || []))
        .catch(() => {});
    };
    load();
    const t = setInterval(load, 4000);
    const c = setInterval(() => setNow(Date.now()), 1000);
    const b = setInterval(() => {
      fetch("/api/broadcasts")
        .then((r) => r.json())
        .then((d) => {
          const x = (d.broadcasts || []).find((y: any) => y.to === "jco" || y.to === "all");
          if (on) setBroadcast(x ? `[${x.fromName}] ${x.message}` : null);
        })
        .catch(() => {});
    }, 15000);
    return () => {
      on = false;
      clearInterval(t);
      clearInterval(c);
      clearInterval(b);
    };
  }, []);

  const escalate = async (v: any) => {
    await fetch("/api/alerts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "create",
        kind: "flag",
        message: `JCO escalation: vehicle ${v.regNo} (${v.driverName}) requires command review`,
        tripId: v.tripId,
        vehicleId: v.vehicleId,
        driverId: v.driverId,
      }),
    });
  };

  const copySummary = async () => {
    const vs = live?.vehicles ?? [];
    const text = [
      `ARMY TRANSPORT — DAILY MONITORING SUMMARY (${new Date().toLocaleString()})`,
      `Active movements: ${vs.length}`,
      `Trips completed today: ${live?.completedToday ?? 0}`,
      `Open alerts: ${(live?.alerts ?? []).length}`,
      ``,
      ...vs.map(
        (v) =>
          `- ${v.regNo} | ${v.driverName} | ${v.unit} | ${v.speed != null ? Math.round(v.speed) + " km/h" : "no speed"} | status: ${v.status}`
      ),
    ].join("\n");
    await navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!session) return null;

  const vs = live?.vehicles ?? [];
  const markers: MapMarker[] = vs.map((v) => ({
    id: String(v.tripId),
    lat: v.lat,
    lng: v.lng,
    label: v.regNo,
    sub: v.speed != null ? `${Math.round(v.speed)} km/h` : "no fix",
    color: v.status === "sos" ? "red" : v.status === "moving" ? "green" : "amber",
    pulse: v.status === "sos",
  }));

  return (
    <div className="min-h-screen bg-[#121810] text-[#eee8d0]">
      <TopBar role="JCO — MONITORING" name={session.name} unit={session.unit} />

      {broadcast && (
        <div className="bg-[#2b2410]/90 border-b border-[#c0a86c]/40 text-[#e8d9a8] text-sm px-4 py-2.5 flex items-center gap-2">
          <Radio size={15} className="shrink-0 animate-pulse" />
          <span className="font-medium">COMMAND: {broadcast}</span>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-4 md:px-8 py-6 space-y-5">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card icon={MonitorCheck} label="Entries monitored" value={String(vs.length)} sub="live movements" tone="text-[#d4c48a]" />
          <Card icon={FileText} label="Completed today" value={String(live?.completedToday ?? 0)} sub="trips closed" tone="text-emerald-300" />
          <Card icon={Radar} label="Fleet size" value={String(live?.totalVehicles ?? 0)} sub="registered vehicles" tone="text-[#d4c48a]" />
          <Card icon={Gauge} label="Open alerts" value={String(live?.alerts?.length ?? 0)} sub="awaiting officer" tone={(live?.alerts?.length ?? 0) ? "text-amber-300" : "text-[#8b8064]"} />
        </div>

        {/* MT Park gate status + contingencies */}
        <JcoMtPanel />

        {/* Live map */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-extrabold flex items-center gap-2">
              <Radar size={19} className="text-[#d4c48a]" /> MONITORING MAP
            </h2>
            <span className="text-[11px] text-[#8b8064] uppercase tracking-wider">auto-refresh 4s</span>
          </div>
          <MapView className="h-[380px] md:h-[440px]" center={BASE_POS} zoom={13} markers={markers} />
        </div>

        <div className="grid lg:grid-cols-2 gap-5">
          {/* Real-time entries */}
          <div className="bg-gradient-to-b from-[#1e2a16] to-[#161f10] border border-[#8b6f2e]/20 rounded-2xl p-4">
            <h3 className="text-sm font-extrabold tracking-widest text-[#d4c48a] mb-3">
              REAL-TIME MOVEMENT ENTRIES
            </h3>
            {vs.length === 0 ? (
              <p className="text-xs text-[#8b8064] py-6 text-center">
                No active entries. Driver terminals feed this table the moment a trip starts.
              </p>
            ) : (
              <div className="space-y-2">
                {vs.map((v) => {
                  const elapsed = Math.floor((now - new Date(v.startedAt).getTime()) / 60000);
                  return (
                    <div key={v.tripId} className="bg-[#141c0e] border border-[#8b6f2e]/15 rounded-xl px-3 py-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <span className="font-extrabold text-sm">{v.regNo}</span>
                          <span className="text-[11px] text-[#8b8064] ml-2">{v.type}</span>
                        </div>
                        <button
                          onClick={() => escalate(v)}
                          className="flex items-center gap-1 text-[10px] font-extrabold text-amber-300 border border-amber-600/40 rounded-md px-2 py-1 hover:bg-amber-900/30 shrink-0"
                        >
                          <ArrowUpRight size={11} /> ESCALATE
                        </button>
                      </div>
                      <div className="text-[11px] text-[#a89a76] mt-1 truncate">
                        {v.driverName} • {v.unit} • {v.status === "moving" ? "en route" : v.status === "sos" ? "SOS ACTIVE" : "GPS stale"}
                      </div>
                      <div className="flex items-center justify-between text-[11px] mt-1.5">
                        <span className="text-[#d4c48a] flex items-center gap-1">
                          <Gauge size={11} /> {v.speed != null ? `${Math.round(v.speed)} km/h` : "—"}
                        </span>
                        <span className="text-[#8b8064]">
                          started {elapsed}m ago {v.lastSeen ? `• fix ${timeAgo(v.lastSeen, now)}` : ""}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Vehicle status log */}
          <div className="bg-gradient-to-b from-[#1e2a16] to-[#161f10] border border-[#8b6f2e]/20 rounded-2xl p-4">
            <h3 className="text-sm font-extrabold tracking-widest text-[#d4c48a] mb-3 flex items-center gap-2">
              <Truck size={15} /> VEHICLE STATUS LOG
            </h3>
            <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
              {fleet.map((v) => (
                <div key={v.id} className="bg-[#141c0e] border border-[#8b6f2e]/15 rounded-xl px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-extrabold text-sm">{v.regNo}</span>
                    <span
                      className={`text-[10px] font-extrabold uppercase tracking-wider ${
                        v.status === "active"
                          ? "text-emerald-300"
                          : v.status === "maintenance"
                            ? "text-rose-300"
                            : "text-[#8b8064]"
                      }`}
                    >
                      {v.status}
                    </span>
                  </div>
                  <div className="text-[11px] text-[#a89a76] mt-0.5">
                    {v.type} • {v.unit}
                  </div>
                  <div className="flex items-center gap-3 mt-2">
                    <span className="flex items-center gap-1 text-[10px] text-[#a89a76] shrink-0">
                      <Fuel size={11} />
                    </span>
                    <div className="flex-1 h-1.5 rounded-full bg-[#0d120b] overflow-hidden">
                      <div
                        className={`h-full rounded-full ${v.fuelPct > 30 ? "bg-emerald-500" : "bg-rose-500"}`}
                        style={{ width: `${v.fuelPct}%` }}
                      />
                    </div>
                    <span className="text-[10px] font-bold text-[#d4c48a] w-8 text-right">{v.fuelPct}%</span>
                  </div>
                  <div className="flex justify-between text-[10px] text-[#8b8064] mt-1.5">
                    <span>{v.mileage.toLocaleString()} km</span>
                    <span>service due: {v.maintenanceDue || "n/a"}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Report */}
        <div className="bg-gradient-to-b from-[#1e2a16] to-[#161f10] border border-[#8b6f2e]/20 rounded-2xl p-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-extrabold tracking-widest text-[#d4c48a]">COMMAND REPORT</h3>
            <p className="text-xs text-[#a89a76] mt-1 max-w-lg">
              Compile the current monitoring picture — movements, completions and alerts — as a
              copy-ready summary for the officer's review.
            </p>
          </div>
          <button
            onClick={copySummary}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#8b6f2e] text-[#1a1508] font-extrabold rounded-xl text-sm hover:brightness-110 transition"
          >
            {copied ? <Check size={15} /> : <Copy size={15} />}
            {copied ? "COPIED" : "COPY SUMMARY"}
          </button>
        </div>
      </main>
    </div>
  );
}

function Card({ icon: Icon, label, value, sub, tone }: any) {
  return (
    <div className="bg-gradient-to-br from-[#1e2a16] to-[#161f10] border border-[#8b6f2e]/15 rounded-2xl p-4">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-[#a89a76] font-bold">
        <Icon size={13} /> {label}
      </div>
      <div className={`text-3xl font-extrabold mt-1.5 ${tone}`}>{value}</div>
      <div className="text-[11px] text-[#8b8064] mt-0.5">{sub}</div>
    </div>
  );
}
