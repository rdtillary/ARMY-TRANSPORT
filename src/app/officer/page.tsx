"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Radar,
  AlertTriangle,
  Siren,
  Flag,
  Truck,
  Send,
  CheckCircle2,
  Radio,
  Gauge,
  Activity,
} from "lucide-react";
import MapView, { type MapMarker } from "@/components/MapView";
import TopBar from "@/components/TopBar";
import { getSession, timeAgo, type Session } from "@/lib/session";
import { BASE_POS } from "@/lib/simulate";

type Live = {
  vehicles: any[];
  alerts: any[];
  completedToday: number;
  totalVehicles: number;
};

export default function OfficerPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [live, setLive] = useState<Live | null>(null);
  const [now, setNow] = useState(Date.now());
  const [to, setTo] = useState("jco");
  const [msg, setMsg] = useState("");
  const [sent, setSent] = useState(false);

  useEffect(() => {
    const s = getSession();
    if (!s || s.role !== "officer") {
      router.replace("/");
      return;
    }
    setSession(s);
  }, [router]);

  /* Live fleet polling */
  useEffect(() => {
    let on = true;
    const load = () =>
      fetch("/api/tracking/live")
        .then((r) => r.json())
        .then((d) => on && setLive(d))
        .catch(() => {});
    load();
    const t = setInterval(load, 4000);
    const c = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      on = false;
      clearInterval(t);
      clearInterval(c);
    };
  }, []);

  const resolveAlert = async (id: number) => {
    await fetch("/api/alerts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "resolve", id }),
    });
  };

  const sendBroadcast = async () => {
    if (!msg.trim() || !session) return;
    await fetch("/api/broadcasts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fromName: session.name, to, message: msg.trim() }),
    });
    setMsg("");
    setSent(true);
    setTimeout(() => setSent(false), 2000);
  };

  if (!session) return null;

  const vs = live?.vehicles ?? [];
  const alerts = live?.alerts ?? [];
  const sosCount = vs.filter((v) => v.status === "sos").length;

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
      <TopBar role="OFFICER — COMMAND" name={session.name} unit={session.unit} />

      <main className="max-w-7xl mx-auto px-4 md:px-8 py-6 space-y-5">
        {/* Stat cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat icon={Truck} label="Active vehicles" value={String(vs.length)} sub={`of ${live?.totalVehicles ?? 0} in fleet`} tone="text-[#d4c48a]" />
          <Stat icon={Activity} label="Trips completed today" value={String(live?.completedToday ?? 0)} sub="since 00:00 hrs" tone="text-emerald-300" />
          <Stat icon={Siren} label="SOS signals" value={String(sosCount)} sub={sosCount ? "IMMEDIATE ACTION" : "all clear"} tone={sosCount ? "text-rose-300" : "text-[#8b8064]"} />
          <Stat icon={Flag} label="Open alerts" value={String(alerts.length)} sub="flags & escalations" tone={alerts.length ? "text-amber-300" : "text-[#8b8064]"} />
        </div>

        <div className="grid lg:grid-cols-[1fr_360px] gap-5">
          {/* Live map */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-extrabold flex items-center gap-2">
                <Radar size={19} className="text-[#d4c48a]" /> LIVE VEHICLE TRACKING
              </h2>
              <span className="text-[11px] text-[#8b8064] uppercase tracking-wider">
                auto-refresh 4s
              </span>
            </div>
            <MapView className="h-[420px] md:h-[520px]" center={BASE_POS} zoom={13} markers={markers} />
            <div className="flex flex-wrap gap-4 text-[11px] text-[#a89a76]">
              <Legend color="bg-emerald-400" label="Moving (GPS fresh)" />
              <Legend color="bg-amber-400" label="Stale — no recent fix" />
              <Legend color="bg-rose-400" label="SOS / emergency" />
            </div>
          </div>

          {/* Right column */}
          <div className="space-y-4">
            {/* Alerts */}
            <div className="bg-gradient-to-b from-[#1e2a16] to-[#161f10] border border-[#8b6f2e]/20 rounded-2xl p-4">
              <h3 className="text-sm font-extrabold tracking-widest text-[#d4c48a] flex items-center gap-2 mb-3">
                <AlertTriangle size={15} /> ALERTS
              </h3>
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {alerts.length === 0 && (
                  <p className="text-xs text-[#8b8064] py-3 text-center">No open alerts — all quiet.</p>
                )}
                {alerts.map((a) => (
                  <div
                    key={a.id}
                    className={`rounded-xl border px-3 py-2.5 ${
                      a.kind === "sos"
                        ? "bg-rose-950/40 border-rose-700/50"
                        : "bg-[#141c0e] border-[#8b6f2e]/20"
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      {a.kind === "sos" ? (
                        <Siren size={15} className="text-rose-300 mt-0.5 shrink-0 animate-pulse" />
                      ) : (
                        <Flag size={15} className="text-amber-300 mt-0.5 shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold leading-snug">{a.message}</p>
                        <p className="text-[10px] text-[#8b8064] mt-1">
                          {a.kind.toUpperCase()} • {timeAgo(a.ts, now)}
                        </p>
                      </div>
                      <button
                        onClick={() => resolveAlert(a.id)}
                        className="text-[10px] font-extrabold text-emerald-300 border border-emerald-600/40 rounded-md px-2 py-1 hover:bg-emerald-900/30 shrink-0"
                      >
                        ACK
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Fleet board */}
            <div className="bg-gradient-to-b from-[#1e2a16] to-[#161f10] border border-[#8b6f2e]/20 rounded-2xl p-4">
              <h3 className="text-sm font-extrabold tracking-widest text-[#d4c48a] flex items-center gap-2 mb-3">
                <Truck size={15} /> ACTIVE MOVEMENTS
              </h3>
              {vs.length === 0 ? (
                <p className="text-xs text-[#8b8064] py-3 text-center">
                  No vehicles on movement. Start a trip from a driver terminal to see live tracking here.
                </p>
              ) : (
                <div className="space-y-2">
                  {vs.map((v) => (
                    <div key={v.tripId} className="bg-[#141c0e] border border-[#8b6f2e]/15 rounded-xl px-3 py-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-extrabold text-sm">{v.regNo}</span>
                        <StatusBadge status={v.status} />
                      </div>
                      <div className="text-[11px] text-[#a89a76] mt-1">
                        {v.driverName} • {v.unit}
                      </div>
                      <div className="flex items-center justify-between text-[11px] mt-1.5">
                        <span className="flex items-center gap-1 text-[#d4c48a]">
                          <Gauge size={11} /> {v.speed != null ? `${Math.round(v.speed)} km/h` : "—"}
                        </span>
                        <span className="text-[#8b8064]">
                          {v.lastSeen ? `fix ${timeAgo(v.lastSeen, now)}` : "no fix yet"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Broadcast */}
            <div className="bg-gradient-to-b from-[#1e2a16] to-[#161f10] border border-[#8b6f2e]/20 rounded-2xl p-4">
              <h3 className="text-sm font-extrabold tracking-widest text-[#d4c48a] flex items-center gap-2 mb-3">
                <Radio size={15} /> BROADCAST ORDER
              </h3>
              <div className="flex gap-2 mb-2">
                <select
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="bg-[#141c0e] border border-[#8b6f2e]/30 rounded-lg px-2.5 py-2 text-xs font-bold focus:outline-none focus:border-[#c0a86c]"
                >
                  <option value="jco">To: JCO terminals</option>
                  <option value="driver">To: Drivers</option>
                  <option value="all">To: All units</option>
                </select>
              </div>
              <div className="flex gap-2">
                <input
                  value={msg}
                  onChange={(e) => setMsg(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && sendBroadcast()}
                  placeholder="Type instruction…"
                  className="flex-1 min-w-0 bg-[#141c0e] border border-[#8b6f2e]/30 rounded-lg px-3 py-2 text-xs placeholder:text-[#5d573f] focus:outline-none focus:border-[#c0a86c]"
                />
                <button
                  onClick={sendBroadcast}
                  disabled={!msg.trim()}
                  className="px-3 rounded-lg bg-[#8b6f2e] text-[#1a1508] font-extrabold hover:brightness-110 disabled:opacity-35 transition flex items-center gap-1.5 text-xs"
                >
                  {sent ? <CheckCircle2 size={14} /> : <Send size={14} />} SEND
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function Stat({ icon: Icon, label, value, sub, tone }: any) {
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

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`w-2.5 h-2.5 rounded-full ${color}`} /> {label}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    moving: "text-emerald-300 border-emerald-600/40 bg-emerald-950/40",
    stale: "text-amber-300 border-amber-600/40 bg-amber-950/40",
    sos: "text-rose-300 border-rose-600/50 bg-rose-950/40 animate-pulse",
  };
  return (
    <span className={`text-[10px] font-extrabold uppercase tracking-wider border rounded-md px-1.5 py-0.5 ${map[status] || map.stale}`}>
      {status}
    </span>
  );
}
