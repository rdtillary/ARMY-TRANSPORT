import { NextResponse } from "next/server";
import { db } from "@/db";
import { users, trips, vehicles } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { ensureSchema } from "@/db/migrate";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** GET /api/drivers/[id] — Admin only. Full driver profile. */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const a = requireRole(req, "officer");
  if ("error" in a) return a.error;

  await ensureSchema();
  const { id } = await ctx.params;
  const driverId = Number(id);
  if (!driverId) return NextResponse.json({ error: "bad driver id" }, { status: 400 });

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
        const prev = pts[i - 1];
        return acc + haversine(prev.lat, prev.lng, p.lat, p.lng);
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

  const vehiclesHandled = Array.from(
    new Map(
      allTrips.map((t) => [t.regNo, { regNo: t.regNo, type: t.type, unit: t.unit }])
    ).values()
  ).sort((x, y) => x.regNo.localeCompare(y.regNo));

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
