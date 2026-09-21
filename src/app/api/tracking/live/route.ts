import { NextResponse } from "next/server";
import { db } from "@/db";
import { trips, vehicles, users, positions, alerts } from "@/db/schema";
import { eq, and, inArray, gte, desc, sql } from "drizzle-orm";

/** GET /api/tracking/live → live fleet picture for Officer + JCO terminals. */
export async function GET() {
  const active = await db
    .select({
      tripId: trips.id,
      vehicleId: trips.vehicleId,
      driverId: trips.driverId,
      startedAt: trips.startedAt,
      regNo: vehicles.regNo,
      type: vehicles.type,
      vUnit: vehicles.unit,
      driverName: users.name,
    })
    .from(trips)
    .innerJoin(vehicles, eq(trips.vehicleId, vehicles.id))
    .innerJoin(users, eq(trips.driverId, users.id))
    .where(eq(trips.status, "active"));

  const openAlerts = await db
    .select()
    .from(alerts)
    .where(eq(alerts.resolved, false))
    .orderBy(desc(alerts.ts));

  const sosTripIds = new Set(
    openAlerts.filter((a) => a.kind === "sos" && a.tripId != null).map((a) => a.tripId as number)
  );

  let latest: Record<number, { lat: number; lng: number; speed: number | null; heading: number | null; accuracy: number | null; ts: Date }> = {};
  if (active.length > 0) {
    const tripIds = active.map((a) => a.tripId);
    const rows = await db
      .select()
      .from(positions)
      .where(inArray(positions.tripId, tripIds))
      .orderBy(desc(positions.ts), desc(positions.id));
    for (const r of rows) {
      if (!(r.tripId in latest)) {
        latest[r.tripId] = {
          lat: r.lat,
          lng: r.lng,
          speed: r.speed,
          heading: r.heading,
          accuracy: r.accuracy,
          ts: r.ts,
        };
      }
    }
  }

  const now = Date.now();
  const vehiclesOut = active.map((a) => {
    const p = latest[a.tripId];
    const age = p ? now - p.ts.getTime() : Infinity;
    const status = sosTripIds.has(a.tripId) ? "sos" : age < 30_000 ? "moving" : "stale";
    return {
      tripId: a.tripId,
      vehicleId: a.vehicleId,
      driverId: a.driverId,
      startedAt: a.startedAt,
      regNo: a.regNo,
      type: a.type,
      unit: a.vUnit,
      driverName: a.driverName,
      lat: p?.lat ?? null,
      lng: p?.lng ?? null,
      speed: p?.speed ?? null,
      heading: p?.heading ?? null,
      accuracy: p?.accuracy ?? null,
      lastSeen: p?.ts ?? null,
      status,
    };
  });

  const since = new Date();
  since.setHours(0, 0, 0, 0);
  const [done] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(trips)
    .where(and(eq(trips.status, "completed"), gte(trips.endedAt, since)));

  const allVehicles = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(vehicles);

  return NextResponse.json({
    vehicles: vehiclesOut,
    alerts: openAlerts,
    completedToday: done?.c ?? 0,
    totalVehicles: allVehicles[0]?.c ?? 0,
  });
}
