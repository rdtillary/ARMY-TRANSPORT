"use client";
import { useEffect, useRef, useState } from "react";
import {
  Users, Phone, Truck, Route, Clock, Upload,
  X, ChevronRight, Camera, CheckCircle2, Gauge,
} from "lucide-react";
import { fmtClock } from "@/lib/session";

type Driver = {
  id: number;
  name: string;
  serviceNo: string;
  unit: string;
  photoUrl: string | null;
  lastVehicleRegNo: string | null;
  lastVehicleType: string | null;
  lastTripAt: string | null;
  tripsCompleted: number;
};

type DriverProfile = {
  driver: {
    id: number;
    name: string;
    serviceNo: string;
    unit: string;
    photoUrl: string | null;
  };
  trips: {
    tripId: number;
    status: string;
    startedAt: string;
    endedAt: string | null;
    regNo: string;
    type: string;
    distanceKm: number;
    points: number;
    durationSec: number;
  }[];
  vehiclesHandled: { regNo: string; type: string; unit: string }[];
  stats: { total: number; completed: number; totalDistanceKm: number };
};

export default function DriversPanel() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<DriverProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    try {
      const d = await fetch("/api/drivers").then((r) => r.json());
      setDrivers(d.drivers || []);
    } catch { /* keep */ }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openProfile = async (driverId: number) => {
    setSelected(null);
    setProfileLoading(true);
    setUploadMsg(null);
    try {
      const d = await fetch(`/api/drivers/${driverId}`).then((r) => r.json());
      setSelected(d);
    } catch { /* keep */ }
    setProfileLoading(false);
  };

  const handlePhotoUpload = async (file: File, driverId: number) => {
    if (file.size > 4 * 1024 * 1024) {
      setUploadMsg("⚠ Photo too large — max 4 MB");
      return;
    }
    setUploading(true);
    setUploadMsg(null);
    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const photoUrl = e.target?.result as string;
        const res = await fetch("/api/drivers", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ driverId, photoUrl }),
        });
        const d = await res.json();
        if (d.ok) {
          setUploadMsg("✔ Photo uploaded successfully");
          // Refresh profile to show new photo
          await openProfile(driverId);
          await load();
        } else {
          setUploadMsg(`⚠ ${d.error}`);
        }
        setUploading(false);
      };
      reader.readAsDataURL(file);
    } catch {
      setUploadMsg("⚠ Upload failed");
      setUploading(false);
    }
  };

  const filtered = drivers.filter(
    (d) =>
      d.name.toLowerCase().includes(search.toLowerCase()) ||
      d.serviceNo.toLowerCase().includes(search.toLowerCase()) ||
      d.unit.toLowerCase().includes(search.toLowerCase())
  );

  const inputCls =
    "w-full bg-[#141c0e] border border-[#8b6f2e]/30 rounded-lg px-3 py-2.5 text-sm placeholder:text-[#5d573f] focus:outline-none focus:border-[#c0a86c]";

  return (
    <div className="bg-gradient-to-b from-[#1e2a16] to-[#161f10] border border-[#8b6f2e]/20 rounded-2xl p-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <h3 className="text-sm font-extrabold tracking-widest text-[#d4c48a] flex items-center gap-2">
          <Users size={15} /> DRIVERS — PERSONNEL REGISTER
        </h3>
        <div className="text-xs text-[#8b8064]">{drivers.length} drivers registered</div>
      </div>

      {/* Search */}
      <div className="mb-4">
        <input
          className={inputCls}
          placeholder="Search by name, service no or unit…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Drivers table */}
      {loading ? (
        <p className="text-xs text-[#8b8064] py-6 text-center">Loading drivers…</p>
      ) : filtered.length === 0 ? (
        <p className="text-xs text-[#8b8064] py-6 text-center">
          {search ? "No drivers match your search." : "No drivers registered yet. Add drivers in Personnel & Fleet."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-[#8b8064] border-b border-[#8b6f2e]/20">
                <th className="py-2 pr-3 w-8">Sr.</th>
                <th className="py-2 pr-3">Name</th>
                <th className="py-2 pr-3">Mobile / Service No</th>
                <th className="py-2 pr-3">Unit</th>
                <th className="py-2 pr-3">Last Vehicle</th>
                <th className="py-2 pr-3 text-center">Trips</th>
                <th className="py-2 text-right">Profile</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((d, idx) => (
                <tr
                  key={d.id}
                  className="border-b border-[#8b6f2e]/10 hover:bg-[#8b6f2e]/5 cursor-pointer transition"
                  onClick={() => openProfile(d.id)}
                >
                  {/* Sr. No */}
                  <td className="py-2.5 pr-3 text-[#8b8064] text-xs">{idx + 1}</td>

                  {/* Name with photo avatar */}
                  <td className="py-2.5 pr-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full overflow-hidden border border-[#8b6f2e]/40 shrink-0 bg-[#141c0e] flex items-center justify-center">
                        {d.photoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={d.photoUrl} alt={d.name} className="w-full h-full object-cover" />
                        ) : (
                          <Users size={14} className="text-[#5d573f]" />
                        )}
                      </div>
                      <div>
                        <div className="font-bold">{d.name}</div>
                        {!d.photoUrl && (
                          <div className="text-[9px] text-[#5d573f]">No photo</div>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Mobile / Service No */}
                  <td className="py-2.5 pr-3">
                    <div className="flex items-center gap-1 text-[#d4c48a] text-xs font-bold">
                      <Phone size={10} className="shrink-0" />
                      {d.serviceNo}
                    </div>
                  </td>

                  {/* Unit */}
                  <td className="py-2.5 pr-3 text-xs text-[#a89a76]">{d.unit}</td>

                  {/* Last Vehicle */}
                  <td className="py-2.5 pr-3">
                    {d.lastVehicleRegNo ? (
                      <div>
                        <div className="text-xs font-extrabold text-emerald-300">{d.lastVehicleRegNo}</div>
                        <div className="text-[10px] text-[#8b8064]">{d.lastVehicleType}</div>
                      </div>
                    ) : (
                      <span className="text-[10px] text-[#5d573f]">No trips yet</span>
                    )}
                  </td>

                  {/* Trips completed */}
                  <td className="py-2.5 pr-3 text-center">
                    <span className="text-xs font-extrabold text-[#d4c48a]">{d.tripsCompleted}</span>
                  </td>

                  {/* View button */}
                  <td className="py-2.5 text-right">
                    <span className="inline-flex items-center gap-1 text-[10px] font-extrabold px-2.5 py-1.5 rounded-lg bg-[#2a361d] border border-[#8b6f2e]/40 text-[#d4c48a]">
                      VIEW <ChevronRight size={10} />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Driver Profile Modal */}
      {(profileLoading || selected) && (
        <div
          className="fixed inset-0 z-[1000] bg-black/80 flex items-center justify-center p-4"
          onClick={() => { setSelected(null); setUploadMsg(null); }}
        >
          <div
            className="bg-[#161f10] border border-[#8b6f2e]/40 rounded-2xl max-w-4xl w-full max-h-[92vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {profileLoading && (
              <div className="py-20 text-center text-sm text-[#a89a76]">Loading driver profile…</div>
            )}

            {selected && (
              <div>
                {/* Profile header */}
                <div className="p-5 border-b border-[#8b6f2e]/25">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-4">
                      {/* Photo */}
                      <div className="relative shrink-0">
                        <div className="w-24 h-24 rounded-2xl overflow-hidden border-2 border-[#8b6f2e]/60 bg-[#141c0e] flex items-center justify-center">
                          {selected.driver.photoUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={selected.driver.photoUrl}
                              alt={selected.driver.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <Camera size={28} className="text-[#5d573f]" />
                          )}
                        </div>
                        {/* Upload button overlay */}
                        <button
                          onClick={() => fileRef.current?.click()}
                          disabled={uploading}
                          className="absolute -bottom-2 -right-2 bg-[#8b6f2e] text-[#1a1508] rounded-lg p-1.5 hover:brightness-110 disabled:opacity-50"
                          title={selected.driver.photoUrl ? "Change photo" : "Upload photo"}
                        >
                          <Upload size={11} />
                        </button>
                        <input
                          ref={fileRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handlePhotoUpload(file, selected.driver.id);
                          }}
                        />
                      </div>

                      {/* Details */}
                      <div>
                        <h3 className="text-xl font-extrabold">{selected.driver.name}</h3>
                        <div className="flex items-center gap-1.5 text-[#d4c48a] text-sm font-bold mt-1">
                          <Phone size={13} /> {selected.driver.serviceNo}
                        </div>
                        <div className="text-xs text-[#a89a76] mt-0.5">{selected.driver.unit}</div>
                        {!selected.driver.photoUrl && (
                          <button
                            onClick={() => fileRef.current?.click()}
                            disabled={uploading}
                            className="mt-2 flex items-center gap-1.5 text-[10px] font-extrabold text-[#8b6f2e] border border-[#8b6f2e]/50 rounded-lg px-2.5 py-1 hover:bg-[#8b6f2e]/15 disabled:opacity-50"
                          >
                            <Upload size={10} />
                            {uploading ? "Uploading…" : "Upload driver photo"}
                          </button>
                        )}
                        {uploadMsg && (
                          <p className={`text-[10px] font-bold mt-1.5 ${uploadMsg.startsWith("✔") ? "text-emerald-300" : "text-rose-300"}`}>
                            {uploadMsg}
                          </p>
                        )}
                      </div>
                    </div>

                    <button
                      onClick={() => { setSelected(null); setUploadMsg(null); }}
                      className="p-2 rounded-lg border border-[#4a3a2a]/50 text-[#a89a76] hover:text-white shrink-0"
                    >
                      <X size={16} />
                    </button>
                  </div>

                  {/* Stats row */}
                  <div className="grid grid-cols-3 gap-3 mt-4">
                    <div className="bg-[#141c0e] border border-[#8b6f2e]/15 rounded-xl px-3 py-2.5">
                      <div className="text-[9px] uppercase tracking-widest text-[#8b8064] flex items-center gap-1">
                        <CheckCircle2 size={9} /> Trips completed
                      </div>
                      <div className="text-2xl font-extrabold text-emerald-300 mt-0.5">{selected.stats.completed}</div>
                    </div>
                    <div className="bg-[#141c0e] border border-[#8b6f2e]/15 rounded-xl px-3 py-2.5">
                      <div className="text-[9px] uppercase tracking-widest text-[#8b8064] flex items-center gap-1">
                        <Route size={9} /> Total distance
                      </div>
                      <div className="text-2xl font-extrabold text-[#d4c48a] mt-0.5">{selected.stats.totalDistanceKm} km</div>
                    </div>
                    <div className="bg-[#141c0e] border border-[#8b6f2e]/15 rounded-xl px-3 py-2.5">
                      <div className="text-[9px] uppercase tracking-widest text-[#8b8064] flex items-center gap-1">
                        <Truck size={9} /> Vehicles handled
                      </div>
                      <div className="text-2xl font-extrabold text-sky-300 mt-0.5">{selected.vehiclesHandled.length}</div>
                    </div>
                  </div>
                </div>

                {/* Trip history */}
                <div className="p-5 border-b border-[#8b6f2e]/25">
                  <h4 className="text-xs font-extrabold tracking-widest text-[#d4c48a] mb-3 flex items-center gap-2">
                    <Route size={13} /> TRIP HISTORY ({selected.trips.length})
                  </h4>
                  {selected.trips.length === 0 ? (
                    <p className="text-xs text-[#8b8064] py-4 text-center">No trips recorded yet.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-[10px] uppercase tracking-wider text-[#8b8064] border-b border-[#8b6f2e]/20">
                            <th className="py-2 pr-3">Vehicle</th>
                            <th className="py-2 pr-3">Started</th>
                            <th className="py-2 pr-3">Ended</th>
                            <th className="py-2 pr-3">Duration</th>
                            <th className="py-2 pr-3">Distance</th>
                            <th className="py-2 pr-3">GPS pts</th>
                            <th className="py-2">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selected.trips.map((t) => (
                            <tr key={t.tripId} className="border-b border-[#8b6f2e]/10">
                              <td className="py-2 pr-3">
                                <div className="font-extrabold text-xs">{t.regNo}</div>
                                <div className="text-[10px] text-[#8b8064]">{t.type}</div>
                              </td>
                              <td className="py-2 pr-3 text-xs whitespace-nowrap">
                                {new Date(t.startedAt).toLocaleString()}
                              </td>
                              <td className="py-2 pr-3 text-xs whitespace-nowrap">
                                {t.endedAt ? new Date(t.endedAt).toLocaleString() : "—"}
                              </td>
                              <td className="py-2 pr-3 text-xs">
                                {Math.round(t.durationSec / 60)} min
                              </td>
                              <td className="py-2 pr-3 text-xs">{t.distanceKm} km</td>
                              <td className="py-2 pr-3 text-xs">{t.points}</td>
                              <td className="py-2">
                                <span className={`text-[9px] font-extrabold uppercase border rounded px-1.5 py-0.5 ${
                                  t.status === "active"
                                    ? "text-sky-300 border-sky-600/50"
                                    : "text-[#8b8064] border-[#5d573f]/60"
                                }`}>
                                  {t.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Vehicles handled */}
                <div className="p-5">
                  <h4 className="text-xs font-extrabold tracking-widest text-[#d4c48a] mb-3 flex items-center gap-2">
                    <Truck size={13} /> VEHICLES HANDLED ({selected.vehiclesHandled.length})
                  </h4>
                  {selected.vehiclesHandled.length === 0 ? (
                    <p className="text-xs text-[#8b8064] py-4 text-center">No vehicles driven yet.</p>
                  ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2">
                      {selected.vehiclesHandled.map((v) => (
                        <div
                          key={v.regNo}
                          className="bg-[#141c0e] border border-[#8b6f2e]/20 rounded-xl px-3 py-2.5"
                        >
                          <div className="font-extrabold text-sm text-[#d4c48a]">{v.regNo}</div>
                          <div className="text-[10px] text-[#8b8064] mt-0.5">{v.type}</div>
                          <div className="text-[9px] text-[#5d573f] mt-0.5">{v.unit}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
