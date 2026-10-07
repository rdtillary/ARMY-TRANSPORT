'use client';

import { useEffect, useState } from 'react';

interface Driver {
  id: number;
  name: string;
  phone?: string;
  status: 'On Duty' | 'Idle';
  currentVehicle: string | null;
}

interface TripHistoryItem {
  id: number;
  vehicleNumber: string;
  status: string;
  startTime: string;
  endTime: string | null;
  startLocation?: string;
  endLocation?: string;
}

export default function AdminDriversPage() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedDriver, setSelectedDriver] = useState<Driver | null>(null);
  const [driverTrips, setDriverTrips] = useState<TripHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    fetchDrivers();
  }, []);

  const fetchDrivers = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/drivers');
      const data = await res.json();
      if (data.drivers) setDrivers(data.drivers);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const openDriverHistory = async (driver: Driver) => {
    setSelectedDriver(driver);
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/admin/drivers/${driver.id}/trips`);
      const data = await res.json();
      setDriverTrips(data.trips || []);
    } catch (err) {
      console.error(err);
    } finally {
      setHistoryLoading(false);
    }
  };

  return (
    <div className="p-6 bg-slate-900 min-h-screen text-slate-100">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Driver Management</h1>
          <p className="text-sm text-slate-400">
            Real-time driver roster, vehicle assignment, and operational records
          </p>
        </div>
        <button
          onClick={fetchDrivers}
          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-sm rounded border border-slate-700"
        >
          Refresh
        </button>
      </div>

      <div className="bg-slate-800/80 border border-slate-700 rounded-lg overflow-hidden shadow-md">
        {loading ? (
          <div className="p-8 text-center text-slate-400">Loading drivers...</div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-950/60 text-slate-300 uppercase text-xs font-semibold border-b border-slate-700">
              <tr>
                <th className="px-5 py-3">Driver Name</th>
                <th className="px-5 py-3">Contact</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Assigned Vehicle</th>
                <th className="px-5 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {drivers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-6 text-center text-slate-400">
                    No drivers registered.
                  </td>
                </tr>
              ) : (
                drivers.map((driver) => (
                  <tr key={driver.id} className="hover:bg-slate-700/40 transition">
                    <td className="px-5 py-3.5">
                      <button
                        onClick={() => openDriverHistory(driver)}
                        className="font-medium text-emerald-400 hover:text-emerald-300 hover:underline text-left cursor-pointer"
                      >
                        {driver.name}
                      </button>
                    </td>
                    <td className="px-5 py-3.5 text-slate-300 font-mono">
                      {driver.phone || '—'}
                    </td>
                    <td className="px-5 py-3.5">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          driver.status === 'On Duty'
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-700'
                            : 'bg-slate-700 text-slate-300'
                        }`}
                      >
                        {driver.status === 'On Duty' && (
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1.5 animate-pulse" />
                        )}
                        {driver.status}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-slate-300 font-mono">
                      {driver.currentVehicle || (
                        <span className="text-slate-500 italic">None (Idle)</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <button
                        onClick={() => openDriverHistory(driver)}
                        className="px-2.5 py-1 text-xs bg-slate-700 hover:bg-slate-600 rounded text-slate-200"
                      >
                        View History
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      {selectedDriver && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-3xl rounded-xl shadow-2xl flex flex-col max-h-[85vh]">
            <div className="flex justify-between items-center p-5 border-b border-slate-700 bg-slate-950">
              <div>
                <h2 className="text-lg font-bold text-slate-100">
                  Trip History: {selectedDriver.name}
                </h2>
                <p className="text-xs text-slate-400 font-mono">
                  Contact: {selectedDriver.phone || 'N/A'} • Status: {selectedDriver.status}
                </p>
              </div>
              <button
                onClick={() => setSelectedDriver(null)}
                className="text-slate-400 hover:text-slate-100 text-xl font-bold p-1"
              >
                ✕
              </button>
            </div>

            <div className="p-5 overflow-y-auto flex-1">
              {historyLoading ? (
                <div className="p-8 text-center text-slate-400">Loading trips...</div>
              ) : driverTrips.length === 0 ? (
                <div className="p-8 text-center text-slate-500">
                  No recorded trips found for this driver.
                </div>
              ) : (
                <div className="space-y-3">
                  {driverTrips.map((trip) => (
                    <div
                      key={trip.id}
                      className="p-3.5 bg-slate-800/80 border border-slate-700 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-semibold text-emerald-400">
                            {trip.vehicleNumber}
                          </span>
                          <span
                            className={`text-xs px-2 py-0.5 rounded capitalize ${
                              trip.status === 'completed'
                                ? 'bg-slate-700 text-slate-300'
                                : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                            }`}
                          >
                            {trip.status}
                          </span>
                        </div>
                        <div className="text-xs text-slate-400 mt-1">
                          Route:{' '}
                          <span className="text-slate-300">
                            {trip.startLocation || 'Base MT Park'}
                          </span>{' '}
                          →{' '}
                          <span className="text-slate-300">
                            {trip.endLocation || 'In Transit / Gate'}
                          </span>
                        </div>
                      </div>

                      <div className="text-xs text-slate-400 text-right">
                        <div>Started: {new Date(trip.startTime).toLocaleString()}</div>
                        {trip.endTime && (
                          <div>Ended: {new Date(trip.endTime).toLocaleString()}</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-700 bg-slate-950 flex justify-end">
              <button
                onClick={() => setSelectedDriver(null)}
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm rounded border border-slate-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
