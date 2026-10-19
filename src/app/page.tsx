"use client";
import { useState } from "react";
import { Shield, ChevronRight, Truck, User, AlertTriangle, MapPin, FileText, Send, CheckCircle, Wifi, Clock, Route, Weight, Menu, X, Star, BarChart3 } from "lucide-react";

type Role = "officer" | "jco" | "driver" | null;

export default function ArmyTransportApp() {
  const [role, setRole] = useState<Role>(null);
  const [loginForm, setLoginForm] = useState({ id: "", pass: "", unit: "7th Armoured" });
  const [loggedIn, setLoggedIn] = useState(false);
  const [view, setView] = useState("dash");
  const [mobileMenu, setMobileMenu] = useState(false);

  const roles = [
    { id: "officer" as Role, label: "Officer", sub: "Command & Control", icon: Star },
    { id: "jco" as Role, label: "JCO", sub: "Monitoring & Data", icon: ChevronRight },
    { id: "driver" as Role, label: "Driver", sub: "Trip Entry", icon: Truck },
  ];

  const handleLogin = () => {
    if (loginForm.id && loginForm.pass) setLoggedIn(true);
  };

  const logout = () => { setLoggedIn(false); setRole(null); setLoginForm({ id: "", pass: "", unit: "7th Armoured" }); };

  if (!role) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#1a2215] via-[#2a361d] to-[#1a2215] text-[#f0e6c8] flex flex-col items-center justify-center px-6 relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.08] bg-[radial-gradient(circle_at_50%_30%,#8b6f2e_0%,transparent_70%)]" />
        <div className="absolute top-8 left-8 text-[#8b6f2e]/30"><Shield size={120} strokeWidth={1} /></div>
        <div className="absolute bottom-10 right-10 text-[#8b6f2e]/30 rotate-12"><Shield size={100} strokeWidth={1} /></div>

        <div className="z-10 text-center mb-10">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-[#8b6f2e]/30 to-[#4a3a1a]/60 border border-[#8b6f2e]/40 mb-4 shadow-2xl shadow-[#8b6f2e]/10">
            <Truck size={42} className="text-[#d4c48a]" />
          </div>
          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tighter text-[#eee8d0] drop-shadow-lg leading-none">AI TRANSPORT</h1>
          <h2 className="text-xl md:text-2xl font-light text-[#c8b896] tracking-[0.3em] mt-2">& ROAD SPACE MANAGEMENT</h2>
          <div className="mx-auto mt-4 h-1 w-24 bg-gradient-to-r from-transparent via-[#8b6f2e] to-transparent rounded-full" />
          <p className="text-sm md:text-base text-[#b5aa88] mt-3 font-medium tracking-wide">ARMY COMMAND SYSTEM — CLASSIFIED USE</p>
        </div>

        <div className="z-10 w-full max-w-3xl grid md:grid-cols-3 gap-5">
          {roles.map((r) => (
            <button key={r.id} onClick={() => setRole(r.id)} className="group relative p-7 rounded-2xl bg-gradient-to-b from-[#2d3a21]/80 to-[#1f2a16]/90 border border-[#8b6f2e]/20 hover:border-[#c0a86c]/50 hover:shadow-2xl hover:shadow-[#8b6f2e]/10 transition-all duration-300 text-left backdrop-blur-sm">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2.5 rounded-xl bg-[#8b6f2e]/15 text-[#d4c48a] group-hover:bg-[#8b6f2e]/30 transition-colors"><r.icon size={22} /></div>
                <h3 className="text-2xl font-bold text-[#eee8d0]">{r.label}</h3>
              </div>
              <p className="text-[#b5aa88] text-sm font-medium">{r.sub}</p>
              <div className="mt-4 text-xs uppercase tracking-widest text-[#8b6f2e] font-bold">Select Role →</div>
            </button>
          ))}
        </div>

        <footer className="z-10 mt-12 text-[#7a6d52] text-xs tracking-wider">SECURE CONNECTION • ENCRYPTED • ARMY NETWORK</footer>
      </div>
    );
  }

  if (role && !loggedIn) {
    const rInfo = roles.find((r) => r.id === role)!;
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#1a2215] via-[#2a361d] to-[#1a2215] text-[#f0e6c8] flex items-center justify-center px-6">
        <div className="w-full max-w-md bg-[#232c18]/90 border border-[#8b6f2e]/30 rounded-3xl p-8 shadow-2xl backdrop-blur-md">
          <button onClick={() => setRole(null)} className="text-xs text-[#8b6f2e] mb-4 hover:underline">← Back</button>
          <div className="flex items-center gap-3 mb-6"><rInfo.icon size={28} className="text-[#d4c48a]" /><h2 className="text-2xl font-bold">{rInfo.label} Login</h2></div>
          <div className="space-y-4">
            <div><label className="text-xs uppercase tracking-widest text-[#b5aa88] mb-1 block">Service No / ID</label><input value={loginForm.id} onChange={e => setLoginForm({ ...loginForm, id: e.target.value })} className="w-full bg-[#161f10] border border-[#8b6f2e]/30 rounded-xl px-4 py-3 text-[#eee8d0] focus:outline-none focus:border-[#c0a86c]" placeholder="e.g. 88472 / DRV-1123" /></div>
            <div><label className="text-xs uppercase tracking-widest text-[#b5aa88] mb-1 block">Password</label><input type="password" value={loginForm.pass} onChange={e => setLoginForm({ ...loginForm, pass: e.target.value })} className="w-full bg-[#161f10] border border-[#8b6f2e]/30 rounded-xl px-4 py-3 text-[#eee8d0] focus:outline-none focus:border-[#c0a86c]" placeholder="••••••••" /></div>
            <div><label className="text-xs uppercase tracking-widest text-[#b5aa88] mb-1 block">Unit / Formation</label>
              <select value={loginForm.unit} onChange={e => setLoginForm({ ...loginForm, unit: e.target.value })} className="w-full bg-[#161f10] border border-[#8b6f2e]/30 rounded-xl px-4 py-3 text-[#eee8d0] focus:outline-none focus:border-[#c0a86c]">
                {["7th Armoured", "12th Mechanised", "3rd Cavalry", "Signal Corps"].map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <button onClick={handleLogin} className="w-full py-3.5 bg-gradient-to-r from-[#8b6f2e] to-[#bfa15a] text-[#1a1508] font-extrabold rounded-xl hover:brightness-110 transition shadow-lg">LOG IN</button>
          </div>
        </div>
      </div>
    );
  }

  // DASHBOARDS
  const nav = [
    { id: "dash", label: "Dashboard", icon: BarChart3 },
    { id: "map", label: "Live Map", icon: MapPin },
    { id: "alerts", label: "Alerts", icon: AlertTriangle },
    { id: "reports", label: "Reports", icon: FileText },
  ];

  return (
    <div className="min-h-screen bg-[#121810] text-[#eee8d0] font-sans selection:bg-[#8b6f2e]/30">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-[#1a2215]/90 backdrop-blur border-b border-[#8b6f2e]/20">
        <div className="max-w-7xl mx-auto px-4 md:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3"><div className="p-2 bg-[#8b6f2e]/20 rounded-lg"><Truck size={20} className="text-[#d4c48a]" /></div><div><div className="font-extrabold leading-none tracking-tight text-[#eee8d0]">AI TRANSPORT</div><div className="text-[10px] text-[#b5aa88] uppercase tracking-widest">{role?.toUpperCase()} • SECURE</div></div></div>
          <div className="flex items-center gap-3">
            <button onClick={() => setMobileMenu(!mobileMenu)} className="md:hidden p-2"><Menu size={22} /></button>
            <button onClick={logout} className="text-xs font-bold text-[#a8987a] hover:text-[#eee8d0] bg-[#2a361d] px-3 py-1.5 rounded-lg border border-[#8b6f2e]/20">LOGOUT</button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 md:px-8 py-6 grid lg:grid-cols-[260px_1fr] gap-8">
        {/* Sidebar */}
        <aside className={`${mobileMenu ? "block" : "hidden"} lg:block`}>
          <nav className="space-y-2 sticky top-24">
            {nav.map(n => <button key={n.id} onClick={() => { setView(n.id); setMobileMenu(false); }} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition ${view === n.id ? "bg-gradient-to-r from-[#8b6f2e]/25 to-[#8b6f2e]/10 text-[#d4c48a] border border-[#8b6f2e]/40" : "text-[#b5aa88] hover:text-[#eee8d0] hover:bg-[#2a361d]/60"}`}><n.icon size={18} /> {n.label}</button>)}
          </nav>
        </aside>

        {/* Content */}
        <section>
          {/* Officer */}
          {role === "officer" && (
            <div className="space-y-6 animate-in fade-in duration-500">
              <div className="grid md:grid-cols-4 gap-4">
                {[
                  { label: "Active Convoys", v: "14", sub: "3 Priority", color: "text-emerald-400" },
                  { label: "Road Allocated", v: "78%", sub: "Approaching cap", color: "text-amber-300" },
                  { label: "Alerts Active", v: "4", sub: "2 SOS", color: "text-rose-300" },
                  { label: "Units Online", v: "9", sub: "All green", color: "text-[#8b6f2e]" },
                ].map(s => <div key={s.label} className="bg-gradient-to-br from-[#1e2a16] to-[#161f10] border border-[#8b6f2e]/15 rounded-2xl p-5 shadow-lg"><div className="text-xs uppercase tracking-widest text-[#8b6f2e] font-bold">{s.label}</div><div className={`text-3xl font-extrabold mt-2 ${s.color}`}>{s.v}</div><div className="text-xs text-[#8b8a7a] mt-1">{s.sub}</div></div>)}
              </div>
              <div className="bg-gradient-to-b from-[#1e2a16] to-[#161f10] border border-[#8b6f2e]/15 rounded-3xl p-6">
                <h3 className="text-xl font-extrabold mb-4 flex items-center gap-2"><MapPin size={22} className="text-[#d4c48a]" /> Live Convoy Map</h3>
                <div className="h-72 rounded-2xl bg-[#0d120b] border border-[#8b6f2e]/10 relative overflow-hidden flex items-center justify-center">
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_60%_40%,rgba(139,111,46,0.1),transparent_70%)]" />
                  <div className="grid grid-cols-3 gap-4 w-full max-w-lg px-8">
                    {[
                      { name: "A1 — 7th Armoured", status: "Moving", color: "bg-emerald-500" },
                      { name: "B2 — Signal", status: "Hold", color: "bg-amber-400" },
                      { name: "C1 — 12th Mech", status: "SOS", color: "bg-rose-400" },
                    ].map(c => <div key={c.name} className="bg-[#161f10] border border-[#8b6f2e]/20 rounded-xl p-3"><div className="text-xs font-bold text-[#b5aa88]">{c.name}</div><div className="flex items-center gap-2 mt-1"><span className={`w-2 h-2 rounded-full ${c.color} animate-pulse`} /> <span className="text-xs text-[#eee8d0]">{c.status}</span></div></div>)}
                  </div>
                </div>
              </div>
              <div className="bg-gradient-to-b from-[#1e2a16] to-[#161f10] border border-[#8b6f2e]/15 rounded-3xl p-6">
                <h3 className="text-xl font-extrabold mb-4">Road Space Allocation</h3>
                <div className="grid md:grid-cols-3 gap-3">
                  {[
                    { name: "Route Alpha — North", req: "Convoy B2", action: "Approve", col: "bg-emerald-600" },
                    { name: "Route Beta — East", req: "Convoy C1", action: "Reschedule", col: "bg-amber-500" },
                    { name: "Route Gamma — West", req: "Convoy D3", action: "Reject", col: "bg-rose-500" },
                  ].map(r => <div key={r.name} className="bg-[#161f10] border border-[#8b6f2e]/20 rounded-xl p-4"><div className="font-bold text-[#eee8d0]">{r.name}</div><div className="text-xs text-[#8b8a7a] mt-1">{r.req}</div><button className={`mt-3 text-xs font-extrabold text-[#1a1508] px-3 py-1 rounded-md ${r.col}`}>{r.action}</button></div>)}
                </div>
              </div>
            </div>
          )}

          {/* JCO */}
          {role === "jco" && (
            <div className="space-y-6 animate-in fade-in duration-500">
              <div className="grid md:grid-cols-3 gap-4">
                {[
                  { label: "Driver Entries", v: "142", sub: "Today", icon: User },
                  { label: "Discrepancies", v: "3", sub: "Flagged", icon: AlertTriangle },
                  { label: "Reports Ready", v: "7", sub: "Daily/Weekly", icon: FileText },
                ].map(s => <div key={s.label} className="bg-gradient-to-br from-[#1e2a16] to-[#161f10] border border-[#8b6f2e]/15 rounded-2xl p-5"><div className="flex items-center gap-2 text-xs uppercase tracking-widest text-[#8b6f2e] font-bold"><s.icon size={14} /> {s.label}</div><div className="text-3xl font-extrabold mt-2">{s.v}</div><div className="text-xs text-[#8b8a7a] mt-1">{s.sub}</div></div>)}
              </div>
              <div className="bg-gradient-to-b from-[#1e2a16] to-[#161f10] border border-[#8b6f2e]/15 rounded-3xl p-6 overflow-x-auto">
                <h3 className="text-xl font-extrabold mb-4">Real-Time Entries</h3>
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-xs uppercase text-[#8b8a7a] border-b border-[#8b6f2e]/20"><th className="py-2 font-bold">Vehicle</th><th className="py-2 font-bold">Driver</th><th className="py-2 font-bold">Unit</th><th className="py-2 font-bold">Cargo</th><th className="py-2 font-bold">Status</th><th className="py-2 font-bold">Action</th></tr></thead>
                  <tbody>
                    {[
                      { v: "45-A-112", d: "Lance Cpl S. Rawat", u: "7th Armoured", c: "Ammo / Medical", s: "In Pass" },
                      { v: "12-B-008", d: "Hav K. Mehta", u: "Signal Corps", c: "Comm Gear / Fuel", s: "Overdue" },
                      { v: "33-C-901", d: "Capt R. Singh", u: "3rd Cavalry", c: "Spare Parts", s: "Clear" },
                    ].map(row => <tr key={row.v} className="border-b border-[#8b6f2e]/10"><td className="py-2 font-bold">{row.v}</td><td className="py-2">{row.d}</td><td className="py-2 text-[#b5aa88]">{row.u}</td><td className="py-2">{row.c}</td><td className={`py-2 font-bold ${row.s === "Overdue" ? "text-rose-300" : "text-emerald-300"}`}>{row.s}</td><td className="py-2"><button className="text-xs bg-[#8b6f2e]/20 text-[#d4c48a] px-2 py-1 rounded border border-[#8b6f2e]/30 hover:bg-[#8b6f2e]/40">Flag</button></td></tr>)}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Driver */}
          {role === "driver" && (
            <div className="max-w-2xl mx-auto animate-in fade-in duration-500">
              <div className="bg-gradient-to-b from-[#1e2a16] to-[#161f10] border border-[#8b6f2e]/15 rounded-3xl p-8 shadow-2xl">
                <h2 className="text-2xl font-extrabold mb-6">Trip Entry Form</h2>
                <form className="space-y-4" onSubmit={e => { e.preventDefault(); alert("Trip submitted to Command — AI tracking active."); }}>
                  {[
                    { label: "Vehicle No / Reg", h: "e.g. 45-A-112" },
                    { label: "Unit / Formation", h: "7th Armoured" },
                    { label: "Cargo / Items Carried", h: "Ammo, Medical, Spare" },
                    { label: "Personnel Onboard", h: "Number", type: "number" },
                    { label: "Origin", h: "Base / Checkpoint" },
                    { label: "Destination", h: "Target / Depot" },
                  ].map(f => <div key={f.label}><label className="text-xs uppercase tracking-widest text-[#b5aa88] font-bold mb-1 block">{f.label}</label><input type={f.type || "text"} defaultValue={f.h} className="w-full bg-[#161f10] border border-[#8b6f2e]/30 rounded-xl px-4 py-3 focus:outline-none focus:border-[#c0a86c]" /></div>)}
                  <div className="grid md:grid-cols-2 gap-4"><div><label className="text-xs uppercase tracking-widest text-[#b5aa88] font-bold mb-1 block">Route Assigned</label><input defaultValue="Auto-suggested — Alpha" className="w-full bg-[#161f10] border border-[#8b6f2e]/30 rounded-xl px-4 py-3" /></div><div><label className="text-xs uppercase tracking-widest text-[#b5aa88] font-bold mb-1 block">Departure Time</label><input type="time" className="w-full bg-[#161f10] border border-[#8b6f2e]/30 rounded-xl px-4 py-3" /></div></div>
                  <div><label className="text-xs uppercase tracking-widest text-[#b5aa88] font-bold mb-1 block">Load Weight (kg)</label><input type="number" defaultValue="3500" className="w-full bg-[#161f10] border border-[#8b6f2e]/30 rounded-xl px-4 py-3" /></div>
                  <div className="pt-2"><button type="submit" className="w-full py-3.5 bg-gradient-to-r from-[#8b6f2e] to-[#bfa15a] text-[#1a1508] font-extrabold rounded-xl hover:brightness-110 shadow-lg">SUBMIT TRIP ENTRY</button></div>
                </form>
                <button className="w-full mt-3 py-3 bg-rose-700/80 text-white font-extrabold rounded-xl hover:bg-rose-600 flex items-center justify-center gap-2"><AlertTriangle size={18} /> SOS / EMERGENCY BUTTON</button>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
