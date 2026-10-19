import { NextResponse } from "next/server";
import { db } from "@/db";
import { users, trips, vehicles } from "@/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * GET /api/drivers/[id]
 * Full driver profile:
 * - personal details + photo
 * - all completed trips (same data as archive)
 * - all unique vehicles handled
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const driverId = Number(id);
  if (!driverId) return NextResponse.json({ error: "bad driver id" }, { status: 400 });

  // Driver details
  const [driver] = await db
    .select({
      id: users.id,
      name: users.name,
      serviceNo: users.serviceNo,
      unit: users.unit,
      photoUrl: users.photoUrl,
    })
    .from(users)
    .where(eq(users.id, driverId))
    .limit(1);

  if (!driver) return NextResponse.json({ error: "Driver not found" }, { status: 404 });

  // All trips by this driver
  const allTrips = await db
    .select({
      tripId: trips.id,
      status: trips.status,
      startedAt: trips.startedAt,
      endedAt: trips.endedAt,
      regNo: vehicles.regNo,
      type: vehicles.type,
      unit: vehicles.unit,
    })
    .from(trips)
    .innerJoin(vehicles, eq(trips.vehicleId, vehicles.id))
    .where(eq(trips.driverId, driverId))
    .orderBy(desc(trips.startedAt), desc(trips.id));

  // Calculate distance for each trip from positions
  const { positions } = await import("@/db/schema");
  const tripsWithDistance = await Promise.all(
    allTrips.map(async (t) => {
      const pts = await db
        .select({ lat: positions.lat, lng: positions.lng })
        .from(positions)
        .where(eq(positions.tripId, t.tripId))
        .orderBy(positions.ts);

      const distanceKm = pts.reduce((acc, p, i) => {
        if (i === 0) return 0;
        const a = pts[i - 1];
        return acc + haversine(a.lat, a.lng, p.lat, p.lng);
      }, 0);

      const durationSec = t.endedAt && t.startedAt
        ? Math.round((new Date(t.endedAt).getTime() - new Date(t.startedAt).getTime()) / 1000)
        : Math.round((Date.now() - new Date(t.startedAt).getTime()) / 1000);

      return {
        ...t,
        distanceKm: Math.round(distanceKm * 10) / 10,
        points: pts.length,
        durationSec,
      };
    })
  );

  // Unique vehicles handled — deduplicated by regNo
  const vehiclesHandled = Array.from(
    new Map(
      allTrips.map((t) => [t.regNo, { regNo: t.regNo, type: t.type, unit: t.unit }])
    ).values()
  ).sort((a, b) => a.regNo.localeCompare(b.regNo));

  return NextResponse.json({
    driver,
    trips: tripsWithDistance,
    vehiclesHandled,
    stats: {
      total: allTrips.length,
      completed: allTrips.filter((t) => t.status === "completed").length,
      totalDistanceKm: Math.round(
        tripsWithDistance.reduce((s, t) => s + t.distanceKm, 0) * 10
      ) / 10,
    },
  });
}

function haversine(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
