"use client";
import { useEffect, useState } from "react";
import { UserPlus, Truck, Users, ClipboardPaste, Trash2, CheckCircle2 } from "lucide-react";

type Person = { id: number; name: string; role: string; serviceNo: string; unit: string };
type Vehicle = {
  id: number;
  regNo: string;
  type: string;
  unit: string;
  fuelPct: number;
  mileage: number;
  status: string;
};

export default function AdminPanel() {
  const [people, setPeople] = useState<Person[]>([]);
  const [fleet, setFleet] = useState<Vehicle[]>([]);
  const [tab, setTab] = useState<"personnel" | "vehicles">("personnel");
  const [msg, setMsg] = useState<string | null>(null);

  const [p, setP] = useState({ name: "", role: "driver", serviceNo: "", unit: "", password: "" });
  const [pBulk, setPBulk] = useState("");
  const [v, setV] = useState({ regNo: "", type: "", unit: "", fuelPct: 100 });
  const [vBulk, setVBulk] = useState("");

  const flash = (m: string) => {
    setMsg(m);
    setTimeout(() => setMsg(null), 4000);
  };

  const load = async () => {
    const [u, f] = await Promise.all([
      fetch("/api/users").then((r) => r.json()),
      fetch("/api/vehicles").then((r) => r.json()),
    ]);
    setPeople(u.users || []);
    setFleet(f.vehicles || []);
  };
  useEffect(() => {
    load();
  }, []);

  const addPerson = async () => {
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(p),
    });
    const d = await res.json();
    if (!res.ok) return flash(`⚠ ${d.error}`);
    setP({ name: "", role: "driver", serviceNo: "", unit: "", password: "" });
    flash(`✔ ${d.user.serviceNo} added (default password army123 unless changed)`);
    load();
  };

  const addPeopleBulk = async () => {
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bulk: pBulk }),
    });
    const d = await res.json();
    flash(`✔ Added ${d.created.length} account(s)` + (d.errors.length ? `, skipped: ${d.errors.join("; ")}` : ""));
    setPBulk("");
    load();
  };

  const addVehicle = async () => {
    const res = await fetch("/api/vehicles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(v),
    });
    const d = await res.json();
    if (!res.ok) return flash(`⚠ ${d.error}`);
    setV({ regNo: "", type: "", unit: "", fuelPct: 100 });
    flash(`✔ ${d.vehicle.regNo} added to the fleet`);
    load();
  };

  const addVehiclesBulk = async () => {
    const res = await fetch("/api/vehicles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bulk: vBulk }),
    });
    const d = await res.json();
    flash(`✔ Added ${d.created.length} vehicle(s)` + (d.errors.length ? `, skipped: ${d.errors.join("; ")}` : ""));
    setVBulk("");
    load();
  };

  const del = async (kind: "users" | "vehicles", id: number) => {
    if (!confirm("Delete this entry?")) return;
    await fetch(`/api/${kind}?id=${id}`, { method: "DELETE" });
    load();
  };

  const input =
    "w-full bg-[#141c0e] border border-[#8b6f2e]/30 rounded-lg px-3 py-2.5 text-sm font-medium placeholder:text-[#5d573f] focus:outline-none focus:border-[#c0a86c]";
  const label = "text-[10px] uppercase tracking-widest text-[#a89a76] font-bold mb-1 block";

  return (
    <div className="bg-gradient-to-b from-[#1e2a16] to-[#161f10] border border-[#8b6f2e]/20 rounded-2xl p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h3 className="text-sm font-extrabold tracking-widest text-[#d4c48a] flex items-center gap-2">
          <Users size={15} /> PERSONNEL &amp; FLEET ADMINISTRATION
        </h3>
        <div className="flex bg-[#141c0e] border border-[#8b6f2e]/25 rounded-lg p-0.5">
          {(["personnel", "vehicles"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3.5 py-1.5 rounded-md text-xs font-extrabold uppercase tracking-wider transition ${
                tab === t ? "bg-[#8b6f2e] text-[#1a1508]" : "text-[#a89a76]"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {msg && (
        <div className="mb-4 text-xs font-bold bg-[#20301a] border border-emerald-600/40 text-emerald-200 rounded-lg px-3 py-2 flex items-start gap-2">
          {msg.startsWith("✔") ? <CheckCircle2 size={14} className="mt-0.5 shrink-0" /> : null}
          <span>{msg}</span>
        </div>
      )}

      {tab === "personnel" && (
        <div className="grid lg:grid-cols-2 gap-5">
          {/* Add form */}
          <div>
            <div className="text-xs font-extrabold text-[#d4c48a] mb-3 flex items-center gap-1.5">
              <UserPlus size={13} /> ADD ACCOUNT
            </div>
            <div className="space-y-2.5">
              <div>
                <label className={label}>Full name</label>
                <input className={input} value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} placeholder="e.g. Sgt R. Kumar" />
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className={label}>Role / terminal</label>
                  <select className={input} value={p.role} onChange={(e) => setP({ ...p, role: e.target.value })}>
                    <option value="driver">Driver</option>
                    <option value="jco">JCO</option>
                    <option value="officer">Admin (Control Room)</option>
                  </select>
                </div>
                <div>
                  <label className={label}>Service no / ID</label>
                  <input className={input} value={p.serviceNo} onChange={(e) => setP({ ...p, serviceNo: e.target.value })} placeholder="DRV-3005" />
                </div>
              </div>
              <div>
                <label className={label}>Unit / formation</label>
                <input className={input} value={p.unit} onChange={(e) => setP({ ...p, unit: e.target.value })} placeholder="7th Armoured" />
              </div>
              <div>
                <label className={label}>Password (optional — default army123)</label>
                <input className={input} value={p.password} onChange={(e) => setP({ ...p, password: e.target.value })} placeholder="army123" />
              </div>
              <button
                onClick={addPerson}
                disabled={!p.name || !p.serviceNo}
                className="w-full py-2.5 bg-[#8b6f2e] text-[#1a1508] font-extrabold rounded-lg text-xs tracking-widest hover:brightness-110 disabled:opacity-35"
              >
                ADD ACCOUNT
              </button>
            </div>

            <div className="mt-5">
              <div className="text-xs font-extrabold text-[#d4c48a] mb-2 flex items-center gap-1.5">
                <ClipboardPaste size={13} /> BULK ADD — one per line
              </div>
              <textarea
                rows={4}
                className={input}
                value={pBulk}
                onChange={(e) => setPBulk(e.target.value)}
                placeholder={"role, serviceNo, name, unit\ndriver, DRV-3005, Sgt R. Kumar, 7th Armoured\njco, JCO-2003, Hav P. Das, Signal Corps\nadmin, ADM-002, Maj S. Gill, Central Control Room"}
              />
              <button onClick={addPeopleBulk} disabled={!pBulk.trim()} className="mt-2 w-full py-2 border border-[#8b6f2e]/50 text-[#d4c48a] font-extrabold rounded-lg text-xs hover:bg-[#8b6f2e]/15 disabled:opacity-35">
                ADD ALL LISTED ACCOUNTS
              </button>
            </div>
          </div>

          {/* Personnel table */}
          <div>
            <div className="text-xs font-extrabold text-[#d4c48a] mb-3">REGISTERED PERSONNEL ({people.length})</div>
            <div className="space-y-1.5 max-h-[520px] overflow-y-auto pr-1">
              {people.map((u) => (
                <div key={u.id} className="bg-[#141c0e] border border-[#8b6f2e]/15 rounded-lg px-3 py-2 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-bold truncate">{u.name}</div>
                    <div className="text-[11px] text-[#a89a76] truncate">
                      <span className="text-[#d4c48a] font-bold">{u.serviceNo}</span> · {u.unit}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`text-[9px] font-extrabold uppercase tracking-wider border rounded px-1.5 py-0.5 ${
                        u.role === "officer"
                          ? "text-rose-300 border-rose-600/50"
                          : u.role === "jco"
                            ? "text-amber-300 border-amber-600/40"
                            : "text-emerald-300 border-emerald-600/40"
                      }`}
                    >
                      {u.role === "officer" ? "admin" : u.role}
                    </span>
                    <button onClick={() => del("users", u.id)} className="text-[#6d5f45] hover:text-rose-300" aria-label="Delete">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === "vehicles" && (
        <div className="grid lg:grid-cols-2 gap-5">
          <div>
            <div className="text-xs font-extrabold text-[#d4c48a] mb-3 flex items-center gap-1.5">
              <Truck size={13} /> ADD VEHICLE
            </div>
            <div className="space-y-2.5">
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className={label}>Registration number</label>
                  <input className={input} value={v.regNo} onChange={(e) => setV({ ...v, regNo: e.target.value })} placeholder="0012 AB 9999" />
                </div>
                <div>
                  <label className={label}>Type</label>
                  <input className={input} value={v.type} onChange={(e) => setV({ ...v, type: e.target.value })} placeholder="Truck 5T (Tata)" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className={label}>Unit / formation</label>
                  <input className={input} value={v.unit} onChange={(e) => setV({ ...v, unit: e.target.value })} placeholder="7th Armoured" />
                </div>
                <div>
                  <label className={label}>Fuel % (default 100)</label>
                  <input type="number" min={0} max={100} className={input} value={v.fuelPct} onChange={(e) => setV({ ...v, fuelPct: Number(e.target.value) })} />
                </div>
              </div>
              <button onClick={addVehicle} disabled={!v.regNo} className="w-full py-2.5 bg-[#8b6f2e] text-[#1a1508] font-extrabold rounded-lg text-xs tracking-widest hover:brightness-110 disabled:opacity-35">
                ADD VEHICLE
              </button>
            </div>

            <div className="mt-5">
              <div className="text-xs font-extrabold text-[#d4c48a] mb-2 flex items-center gap-1.5">
                <ClipboardPaste size={13} /> BULK ADD — one per line
              </div>
              <textarea
                rows={4}
                className={input}
                value={vBulk}
                onChange={(e) => setVBulk(e.target.value)}
                placeholder={"regNo, type, unit\n0012 AB 9999, Truck 5T (Tata), 7th Armoured\n0045 KJ 1212, Ambulance (Force), 3rd Cavalry"}
              />
              <button onClick={addVehiclesBulk} disabled={!vBulk.trim()} className="mt-2 w-full py-2 border border-[#8b6f2e]/50 text-[#d4c48a] font-extrabold rounded-lg text-xs hover:bg-[#8b6f2e]/15 disabled:opacity-35">
                ADD ALL LISTED VEHICLES
              </button>
            </div>
          </div>

          <div>
            <div className="text-xs font-extrabold text-[#d4c48a] mb-3">FLEET REGISTER ({fleet.length})</div>
            <div className="space-y-1.5 max-h-[520px] overflow-y-auto pr-1">
              {fleet.map((x) => (
                <div key={x.id} className="bg-[#141c0e] border border-[#8b6f2e]/15 rounded-lg px-3 py-2 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-bold truncate">{x.regNo}</div>
                    <div className="text-[11px] text-[#a89a76] truncate">
                      {x.type} · {x.unit} · ⛽ {x.fuelPct}%
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`text-[9px] font-extrabold uppercase tracking-wider border rounded px-1.5 py-0.5 ${
                        x.status === "active"
                          ? "text-emerald-300 border-emerald-600/40"
                          : x.status === "maintenance"
                            ? "text-rose-300 border-rose-600/40"
                            : "text-[#8b8064] border-[#5d573f]/60"
                      }`}
                    >
                      {x.status}
                    </span>
                    <button onClick={() => del("vehicles", x.id)} disabled={x.status === "active"} className="text-[#6d5f45] hover:text-rose-300 disabled:opacity-25" aria-label="Delete">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
