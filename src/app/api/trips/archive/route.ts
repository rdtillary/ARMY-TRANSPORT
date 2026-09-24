import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { db } from "@/db";
import { trips, vehicles, users, positions } from "@/db/schema";
import { eq, desc, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

/** GET /api/trips/archive?status=all|completed|active */
export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get("status") || "all";

  const rows = await db
    .select({
      tripId: trips.id,
      status: trips.status,
      startedAt: trips.startedAt,
      endedAt: trips.endedAt,
      vehicleId: trips.vehicleId,
      regNo: vehicles.regNo,
      type: vehicles.type,
      driverId: trips.driverId,
      driverName: users.name,
      unit: vehicles.unit,
      points: sql<number>`(select count(*)::int from ${positions} p where p.trip_id = ${trips.id})`,
    })
    .from(trips)
    .innerJoin(vehicles, eq(trips.vehicleId, vehicles.id))
    .innerJoin(users, eq(trips.driverId, users.id))
    .orderBy(desc(trips.startedAt), desc(trips.id))
    .limit(200);

  // PostGIS is not installed — compute distance in JS instead.
  const tripIds = rows.map((r) => r.tripId);
  let distanceMap: Record<number, number> = {};
  if (tripIds.length) {
    const pts = await db
      .select({ tripId: positions.tripId, lat: positions.lat, lng: positions.lng })
      .from(positions)
      .orderBy(sql`${positions.tripId} asc, ${positions.ts} asc, ${positions.id} asc`);
    let prev: Record<number, { lat: number; lng: number }> = {};
    for (const p of pts) {
      const last = prev[p.tripId];
      if (last) distanceMap[p.tripId] = (distanceMap[p.tripId] || 0) + haversine(last.lat, last.lng, p.lat, p.lng);
      prev[p.tripId] = { lat: p.lat, lng: p.lng };
    }
  }

  const out = rows
    .filter((r) => status === "all" || r.status === status)
    .map((r) => ({
      tripId: r.tripId,
      status: r.status,
      startedAt: r.startedAt,
      endedAt: r.endedAt,
      regNo: r.regNo,
      type: r.type,
      unit: r.unit,
      driverName: r.driverName,
      points: r.points,
      distanceKm: Math.round((distanceMap[r.tripId] || 0) * 10) / 10,
      durationSec:
        r.endedAt && r.startedAt
          ? Math.round((r.endedAt.getTime() - r.startedAt.getTime()) / 1000)
          : Math.round((Date.now() - r.startedAt.getTime()) / 1000),
    }));

  return NextResponse.json({ trips: out });
}

function haversine(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
