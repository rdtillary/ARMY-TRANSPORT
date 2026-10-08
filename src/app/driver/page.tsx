"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Play, Square, Siren, LogOut, ChevronDown, Radio, Satellite, MapPin, X } from "lucide-react";
import MapView from "@/components/MapView";
import McteLogo from "@/components/McteLogo";
import { getSession, clearSession, type Session } from "@/lib/session";
import { startGeoWatch, type GeoPos } from "@/lib/geo";
import { createSimulator, BASE_POS } from "@/lib/simulate";

type Vehicle = { id: number; cNo?: number; regNo: string; type: string; unit: string; status: string };
type Trip = { id: number; vehicleId: number; startedAt: string; regNo: string; type: string };

export default function DriverPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehicleId, setVehicleId] = useState("");
  const [trip, setTrip] = useState<Trip | null>(null);
  const [pos, setPos] = useState<GeoPos | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [simMode, setSimMode] = useState(false);
  const [sosSent, setSosSent] = useState(false);
  const [starting, setStarting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [broadcast, setBroadcast] = useState<string | null>(null);
  const [notes, setNotes] = useState<any[]>([]);
  const simRef = useRef<(() => GeoPos) | null>(null);

  const flash = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2200);
  };

  const getCurrentPosition = (): Promise<GeoPos> =>
    new Promise((resolve) => {
      if (!("geolocation" in navigator)) {
        resolve({ lat: BASE_POS[0], lng: BASE_POS[1] });
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            speed: position.coords.speed != null ? position.coords.speed * 3.6 : undefined,
            heading: position.coords.heading ?? undefined,
            accuracy: position.coords.accuracy,
          });
        },
        () => {
          resolve({ lat: BASE_POS[0], lng: BASE_POS[1] });
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
      );
    });

  /* Session guard — one-time login: the stored session survives app restarts. */
  useEffect(() => {
    const s = getSession();
    if (!s || s.role !== "driver") {
      router.replace("/");
      return;
    }
    setSession(s);
  }, [router]);

  /* Vehicle registry */
  useEffect(() => {
    if (!session) return;
    fetch("/api/vehicles")
      .then((r) => r.json())
      .then((d) => setVehicles(d.vehicles || []))
      .catch(() => {});
  }, [session]);

  /* Resume an in-progress movement when the app is reopened */
  useEffect(() => {
    if (!session || trip) return;
    fetch(`/api/trips?userId=${session.id}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.trip) {
          setTrip(d.trip);
          setSosSent(false);
        }
      })
      .catch(() => {});
  }, [session, trip]);

  /* Command broadcast banner */
  useEffect(() => {
    if (!session) return;
    const load = () =>
      fetch("/api/broadcasts")
        .then((r) => r.json())
        .then((d) => {
          const b = (d.broadcasts || []).find((x: any) => x.to === "driver" || x.to === "all");
          setBroadcast(b ? b.message : null);
        })
        .catch(() => {});
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [session]);

  /* MT Park / contingency notifications addressed to this driver */
  useEffect(() => {
    if (!session) return;
    const load = () =>
      fetch(`/api/notifications?userId=${session.id}&role=driver`)
        .then((r) => r.json())
        .then((d) => setNotes((d.notifications || []).filter((n: any) => !n.read)))
        .catch(() => {});
    load();
    const t = setInterval(load, 8000); // repeats (e.g. stopped-while-OUT) arrive every 1 min
    return () => clearInterval(t);
  }, [session]);

  const dismissNote = async (id: number) => {
    setNotes((ns) => ns.filter((n) => n.id !== id));
    await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "read", ids: [id] }),
    });
  };

  /* GPS / simulation tracking loop */
  useEffect(() => {
    if (!trip) return;
    let stop: (() => void) | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;
    setGpsError(null);
    setPos(null);

    const send = async (p: GeoPos) => {
      if (cancelled) return;
      setPos(p);
      try {
        await fetch("/api/trips/track", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tripId: trip.id, ...p }),
        });
      } catch {
        /* transient blip — next tick retries */
      }
    };

    if (simMode) {
      simRef.current = createSimulator();
      void send(simRef.current());
      timer = setInterval(() => {
        if (simRef.current) void send(simRef.current());
      }, 2500);
    } else {
      startGeoWatch(send, (msg) => {
        if (!cancelled) setGpsError(msg);
      }).then((s) => {
        if (cancelled) s();
        else stop = s;
      });
    }

    return () => {
      cancelled = true;
      stop?.();
      if (timer) clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip?.id, simMode]);

  const logout = () => {
    clearSession();
    router.replace("/");
  };

  const start = async () => {
    if (!vehicleId || !session || starting || trip) return;
    setStarting(true);
    try {
      const startPosition = await getCurrentPosition();
      setPos(startPosition);

      const res = await fetch("/api/trips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          driverId: session.id,
          vehicleId: Number(vehicleId),
          lat: startPosition.lat,
          lng: startPosition.lng,
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        flash(d.error || "Could not start trip");
        return;
      }
      setTrip(d.trip);
      setVehicleId("");
      setSosSent(false);
    } catch {
      flash("Server unreachable");
    } finally {
      setStarting(false);
    }
  };

  const stop = async () => {
    if (!trip) return;
    await fetch("/api/trips/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tripId: trip.id, action: "complete" }),
    });
    setTrip(null);
    setPos(null);
    setSosSent(false);
    flash("Movement stopped — vehicle reported to base");
  };

  const raiseSos = async () => {
    if (!trip || sosSent) return;
    setSosSent(true);
    await fetch("/api/trips/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tripId: trip.id, action: "sos" }),
    });
    flash("SOS transmitted to command");
  };

  const formatVehicleLabel = (v: Vehicle) => `${v.cNo ?? v.id} • ${v.regNo} • ${v.type}`;

  if (!session) return null;

  const available = vehicles.filter((v) => v.status === "available");
  const speed = pos?.speed != null ? Math.round(pos.speed) : null;

  const noteBanners = (
    <div className="fixed top-16 inset-x-0 z-[960] flex flex-col items-center gap-2 px-4 pointer-events-none">
      {notes.slice(0, 2).map((n) => (
        <div
          key={n.id}
          className={`pointer-events-auto w-full max-w-md flex items-start gap-2.5 rounded-xl border px-4 py-3 shadow-2xl ${
            n.kind === "alarm"
              ? "bg-rose-950/95 border-rose-500/60 text-rose-100"
              : "bg-[#2b2410]/95 border-[#c0a86c]/50 text-[#e8d9a8]"
          }`}
        >
          {n.kind === "alarm" ? <Siren size={17} className="mt-0.5 shrink-0 animate-pulse" /> : <Radio size={17} className="mt-0.5 shrink-0" />}
          <div className="flex-1 min-w-0">
            <div className="text-xs font-extrabold tracking-wide">{n.title}</div>
            <div className="text-xs mt-0.5 leading-snug">{n.message}</div>
          </div>
          <button onClick={() => dismissNote(n.id)} className="text-current/70 hover:text-white shrink-0" aria-label="Dismiss">
            <X size={15} />
          </button>
        </div>
      ))}
    </div>
  );

  /* ================= PRE-TRIP: dropdown + big circular START ================= */
  if (!trip) {
    return (
      <div className="min-h-dvh bg-[#121810] text-[#eee8d0] flex flex-col relative overflow-hidden">
        {noteBanners}
        <div className="absolute inset-0 opacity-[0.06] bg-[radial-gradient(circle_at_50%_68%,#b08d3c_0%,transparent_60%)] pointer-events-none" />

        {broadcast && (
          <div className="bg-[#2b2410]/95 border-b border-[#c0a86c]/40 text-[#e8d9a8] text-xs md:text-sm px-4 py-2 flex items-center gap-2 z-10">
            <Radio size={14} className="shrink-0 animate-pulse" />
            <span className="font-medium truncate">COMMAND: {broadcast}</span>
          </div>
        )}

        <header className="flex items-center justify-between gap-3 px-5 py-3 z-10">
          <div className="flex items-center gap-2.5 min-w-0">
            <McteLogo size={34} className="shrink-0 drop-shadow-[0_2px_8px_rgba(220,40,40,0.45)]" />
            <div className="min-w-0">
              <div className="text-[9px] leading-tight font-bold tracking-[0.16em] text-[#d4c48a] uppercase truncate">
                Military College of Telecommunication Engineering
              </div>
              <div className="text-[10px] font-bold tracking-[0.25em] text-[#b08d3c]">MCTE · DRIVER</div>
            </div>
          </div>
          <button
            onClick={logout}
            className="p-2.5 rounded-xl border border-[#4a3a2a]/40 text-[#6d5f45] hover:text-[#eee8d0] transition shrink-0"
            aria-label="Log out"
          >
            <LogOut size={17} />
          </button>
        </header>

        <div className="flex-1 z-10 flex flex-col items-center justify-center gap-9 px-6">
          <div className="w-full max-w-sm">
            <label
              htmlFor="veh"
              className="text-[11px] uppercase tracking-[0.25em] text-[#a89a76] font-bold mb-2 block"
            >
              Vehicle number
            </label>
            <div className="relative">
              <select
                id="veh"
                value={vehicleId}
                onChange={(e) => setVehicleId(e.target.value)}
                className="w-full appearance-none bg-[#141c0e] border-2 border-[#8b6f2e]/40 focus:border-[#c0a86c] rounded-2xl px-5 py-4 text-lg font-extrabold focus:outline-none"
              >
                <option value="">— SELECT VEHICLE —</option>
                {available.map((v) => (
                  <option key={v.id} value={v.id}>
                    {formatVehicleLabel(v)}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={20}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-[#8b6f2e] pointer-events-none"
              />
            </div>
            {available.length === 0 && (
              <p className="text-xs text-amber-300/80 mt-2">
                No vehicles available — all on movement or maintenance.
              </p>
            )}
          </div>

          <button
            onClick={start}
            disabled={!vehicleId || starting}
            aria-label="Start movement"
            className="relative w-[78vw] max-w-[380px] aspect-square rounded-full disabled:cursor-not-allowed select-none"
          >
            <span className="absolute -inset-3 rounded-full border border-[#8b6f2e]/25" />
            <span
              className={`absolute inset-0 rounded-full flex flex-col items-center justify-center gap-2 border-[6px] transition-all duration-200 ${
                vehicleId
                  ? "bg-gradient-to-b from-[#d8bd7d] via-[#bfa15a] to-[#8b6f2e] border-[#e6d7a5]/70 text-[#1a1508] shadow-[0_0_90px_rgba(139,111,46,0.4)] active:scale-[0.97]"
                  : "bg-[#1a2311] border-[#39442a] text-[#5d573f]"
              }`}
            >
              <Play size={58} fill="currentColor" strokeWidth={1} />
              <span className="text-3xl font-black tracking-[0.25em] pl-1">
                {starting ? "…" : "START"}
              </span>
              <span
                className={`text-[10px] font-bold tracking-[0.18em] ${
                  vehicleId ? "text-[#3d3210]" : "text-[#5d573f]"
                }`}
              >
                {vehicleId ? "PRESS TO BEGIN GPS TRACKING" : "SELECT VEHICLE FIRST"}
              </span>
            </span>
          </button>
        </div>

        <p className="relative z-10 pb-6 text-center text-[10px] text-[#6d6349] tracking-[0.25em]">
          LIVE TRACKING VISIBLE TO OFFICER & JCO
        </p>

        {toast && (
          <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[950] bg-[#20301a] border border-emerald-500/50 text-emerald-200 text-xs font-bold px-4 py-2 rounded-xl shadow-2xl flex items-center gap-2">
            <MapPin size={13} /> {toast}
          </div>
        )}
      </div>
    );
  }

  /* ================= ACTIVE TRIP: map + STOP + SOS only ================= */
  return (
    <div className="fixed inset-0 z-0 flex flex-col bg-[#121810] text-[#eee8d0]">
      {noteBanners}
      <div className="relative flex-1 min-h-0">
        <MapView
          className="h-full"
          center={pos ? [pos.lat, pos.lng] : BASE_POS}
          zoom={13}
          followId="me"
          markers={[
            {
              id: "me",
              lat: pos?.lat ?? null,
              lng: pos?.lng ?? null,
              label: trip.regNo,
              sub: speed != null ? `${speed} km/h` : "acquiring…",
              color: "gold",
              pulse: true,
            },
          ]}
        />

        {/* status chip + GPS helpers */}
        <div className="absolute top-3 inset-x-0 z-[660] flex flex-col items-center gap-2 px-3 pointer-events-none">
          <div className="pointer-events-auto flex items-center gap-2.5 bg-[#141c0e]/95 border border-[#8b6f2e]/40 rounded-2xl px-4 py-2 shadow-xl">
            <McteLogo size={18} className="shrink-0" />
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-extrabold text-sm">{trip.regNo}</span>
            <span className="text-xs text-[#a89a76]">
              {speed != null ? `${speed} km/h` : "acquiring GPS…"}
            </span>
          </div>
          {gpsError && !simMode && (
            <button
              onClick={() => setSimMode(true)}
              className="pointer-events-auto flex items-center gap-2 bg-amber-950/95 border border-amber-600/60 text-amber-200 rounded-xl px-3.5 py-2 text-[11px] font-bold shadow-xl"
            >
              <Satellite size={14} /> GPS SIGNAL LOST — TAP FOR SIMULATION
            </button>
          )}
          <button
            onClick={() => setSimMode((s) => !s)}
            className="pointer-events-auto text-[10px] font-extrabold tracking-[0.15em] bg-[#141c0e]/90 border border-[#8b6f2e]/40 text-[#a89a76] rounded-lg px-2.5 py-1"
          >
            SIMULATED GPS: {simMode ? "ON" : "OFF"}
          </button>
        </div>

        {toast && (
          <div className="absolute top-32 left-1/2 -translate-x-1/2 z-[670] bg-[#20301a] border border-emerald-500/50 text-emerald-200 text-xs font-bold px-4 py-2 rounded-xl shadow-2xl flex items-center gap-2">
            <MapPin size={13} /> {toast}
          </div>
        )}
      </div>

      {/* bottom controls */}
      <div className="flex items-center justify-center gap-10 px-6 pt-3 pb-6 bg-gradient-to-t from-[#0c110a] via-[#0c110a]/70 to-transparent">
        <button
          onClick={stop}
          className="w-28 h-28 md:w-32 md:h-32 rounded-full flex flex-col items-center justify-center gap-1.5 bg-[#1f3a24] border-4 border-emerald-500/60 text-emerald-200 font-black tracking-[0.2em] shadow-2xl transition active:scale-95"
          aria-label="Stop movement"
        >
          <Square size={32} fill="currentColor" />
          <span className="text-sm">STOP</span>
        </button>
        <button
          onClick={raiseSos}
          disabled={sosSent}
          className={`w-28 h-28 md:w-32 md:h-32 rounded-full flex flex-col items-center justify-center gap-1.5 border-4 font-black tracking-[0.15em] shadow-2xl transition active:scale-95 ${
            sosSent
              ? "bg-[#3a1518] border-rose-900 text-rose-300/70 cursor-default"
              : "bg-gradient-to-b from-rose-600 to-rose-800 border-rose-300/60 text-white shadow-[0_0_55px_rgba(244,63,94,0.45)]"
          }`}
          aria-label="Send SOS"
        >
          <Siren size={32} className={sosSent ? "" : "animate-pulse"} />
          <span className="text-sm">{sosSent ? "SENT" : "SOS"}</span>
        </button>
      </div>
    </div>
  );
}
