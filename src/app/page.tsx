"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Shield, Truck, Star, ChevronsUp, Lock, User, AlertCircle } from "lucide-react";
import { saveSession, getSession, type Session } from "@/lib/session";

type Role = "officer" | "jco" | "driver";

const ROLES: { id: Role; label: string; sub: string; icon: any; demo: string; demoPass: string }[] = [
  { id: "officer", label: "Officer", sub: "Command & Control", icon: Star, demo: "OFC-1001", demoPass: "army123" },
  { id: "jco", label: "JCO", sub: "Monitoring & Data", icon: ChevronsUp, demo: "JCO-2002", demoPass: "army123" },
  { id: "driver", label: "Driver", sub: "Trip & GPS Tracking", icon: Truck, demo: "DRV-3003", demoPass: "army123" },
];

export default function LoginPage() {
  const router = useRouter();
  const [role, setRole] = useState<Role | null>(null);
  const [serviceNo, setServiceNo] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(true);

  /* One-time login: if a session already exists, jump straight to that terminal. */
  useEffect(() => {
    const s = getSession();
    if (s && (s.role === "officer" || s.role === "jco" || s.role === "driver")) {
      router.replace(`/${s.role}`);
    } else {
      setChecking(false);
    }
  }, [router]);

  if (checking) {
    return (
      <div className="min-h-screen bg-[#141b10] flex flex-col items-center justify-center text-[#eee8d0]">
        <div className="p-4 rounded-2xl bg-[#8b6f2e]/15 text-[#d4c48a] mb-4">
          <Shield size={38} />
        </div>
        <div className="text-sm tracking-[0.35em] text-[#a89a76] font-bold">AI TRANSPORT</div>
        <div className="mt-3 text-xs text-[#6d6349] animate-pulse">Restoring session…</div>
      </div>
    );
  }

  const info = ROLES.find((r) => r.id === role);

  const login = async () => {
    if (!role || !serviceNo || !password || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, serviceNo, password }),
      });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error || "Login failed");
        return;
      }
      saveSession(d as Session);
      router.push(`/${d.role}`);
    } catch {
      setError("Server unreachable — check connection");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#141b10] via-[#222e18] to-[#141b10] text-[#f0e6c8] flex flex-col items-center justify-center px-5 py-10 relative overflow-hidden">
      <div className="absolute inset-0 opacity-[0.07] bg-[radial-gradient(circle_at_50%_28%,#b08d3c_0%,transparent_65%)]" />
      <div className="absolute top-6 left-6 text-[#8b6f2e]/25 pointer-events-none">
        <Shield size={110} strokeWidth={1} />
      </div>
      <div className="absolute bottom-8 right-6 text-[#8b6f2e]/25 rotate-12 pointer-events-none">
        <Shield size={90} strokeWidth={1} />
      </div>

      {!role ? (
        <div className="relative z-10 w-full max-w-3xl">
          <div className="text-center mb-9">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-[#8b6f2e]/30 to-[#4a3a1a]/60 border border-[#8b6f2e]/40 mb-4 shadow-2xl shadow-[#8b6f2e]/10">
              <Truck size={40} className="text-[#d4c48a]" />
            </div>
            <h1 className="text-4xl md:text-5xl font-extrabold tracking-tighter text-[#eee8d0] leading-none">
              AI TRANSPORT
            </h1>
            <h2 className="text-base md:text-xl font-light text-[#c8b896] tracking-[0.35em] mt-3">
              ROAD SPACE MANAGEMENT
            </h2>
            <div className="mx-auto mt-4 h-px w-28 bg-gradient-to-r from-transparent via-[#8b6f2e] to-transparent" />
            <p className="text-sm text-[#a89a76] mt-3 tracking-wide">
              ARMY COMMAND SYSTEM — SELECT YOUR TERMINAL
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            {ROLES.map((r) => (
              <button
                key={r.id}
                onClick={() => {
                  setRole(r.id);
                  setError(null);
                }}
                className="group p-6 rounded-2xl bg-gradient-to-b from-[#2d3a21]/80 to-[#1f2a16]/90 border border-[#8b6f2e]/20 hover:border-[#c0a86c]/60 hover:shadow-2xl hover:shadow-[#8b6f2e]/15 transition-all text-left"
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2.5 rounded-xl bg-[#8b6f2e]/15 text-[#d4c48a] group-hover:bg-[#8b6f2e]/30 transition-colors">
                    <r.icon size={20} />
                  </div>
                  <h3 className="text-xl font-bold text-[#eee8d0]">{r.label}</h3>
                </div>
                <p className="text-[#a89a76] text-sm">{r.sub}</p>
                <div className="mt-4 text-[11px] uppercase tracking-[0.2em] text-[#8b6f2e] font-bold">
                  Select Terminal →
                </div>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="relative z-10 w-full max-w-md">
          <button
            onClick={() => {
              setRole(null);
              setError(null);
              setPassword("");
            }}
            className="text-xs text-[#8b6f2e] mb-4 hover:text-[#d4c48a]"
          >
            ← Back to terminals
          </button>
          <div className="bg-[#202b15]/95 border border-[#8b6f2e]/30 rounded-3xl p-7 shadow-2xl">
            <div className="flex items-center gap-3 mb-5">
              <div className="p-2.5 rounded-xl bg-[#8b6f2e]/20 text-[#d4c48a]">
                {info && <info.icon size={20} />}
              </div>
              <div>
                <h2 className="text-xl font-extrabold leading-tight">{info?.label} Terminal</h2>
                <p className="text-[11px] text-[#a89a76] uppercase tracking-widest">{info?.sub}</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-[11px] uppercase tracking-widest text-[#a89a76] mb-1.5 flex items-center gap-1.5">
                  <User size={12} /> Service Number / ID
                </label>
                <input
                  value={serviceNo}
                  onChange={(e) => setServiceNo(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && login()}
                  placeholder={info?.demo}
                  className="w-full bg-[#141c0e] border border-[#8b6f2e]/30 rounded-xl px-4 py-3 text-[#eee8d0] placeholder:text-[#5d573f] focus:outline-none focus:border-[#c0a86c]"
                />
              </div>
              <div>
                <label className="text-[11px] uppercase tracking-widest text-[#a89a76] mb-1.5 flex items-center gap-1.5">
                  <Lock size={12} /> Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && login()}
                  placeholder="••••••••"
                  className="w-full bg-[#141c0e] border border-[#8b6f2e]/30 rounded-xl px-4 py-3 text-[#eee8d0] placeholder:text-[#5d573f] focus:outline-none focus:border-[#c0a86c]"
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 text-sm text-rose-300 bg-rose-950/40 border border-rose-800/50 rounded-xl px-3 py-2.5">
                  <AlertCircle size={15} /> {error}
                </div>
              )}

              <button
                onClick={login}
                disabled={!serviceNo || !password || busy}
                className="w-full py-3.5 bg-gradient-to-r from-[#8b6f2e] to-[#bfa15a] text-[#1a1508] font-extrabold rounded-xl hover:brightness-110 active:brightness-95 transition disabled:opacity-40 disabled:cursor-not-allowed shadow-lg"
              >
                {busy ? "VERIFYING…" : "LOG IN"}
              </button>

              <div className="text-center text-[11px] text-[#8b8064] bg-[#141c0e]/60 border border-[#8b6f2e]/15 rounded-xl px-3 py-2">
                Demo: <span className="font-bold text-[#d4c48a]">{info?.demo}</span> /{" "}
                <span className="font-bold text-[#d4c48a]">{info?.demoPass}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      <footer className="relative z-10 mt-10 text-[#6d6349] text-[11px] tracking-[0.25em] text-center">
        SECURE CONNECTION • ENCRYPTED • ARMY NETWORK
      </footer>
    </div>
  );
}
