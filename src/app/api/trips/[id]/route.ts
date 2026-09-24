import { NextResponse } from "next/server";
import { db } from "@/db";
import { trips, vehicles, users, positions, gateEvents, incidents } from "@/db/schema";
import { eq, and, asc, gte, lte } from "drizzle-orm";

export const dynamic = "force-dynamic";

/** GET /api/trips/:id — full trip record: route points, gate photos, incidents. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const tripId = Number(id);
  if (!tripId) return NextResponse.json({ error: "bad trip id" }, { status: 400 });

  const head = await db
    .select({
      tripId: trips.id,
      status: trips.status,
      startedAt: trips.startedAt,
      endedAt: trips.endedAt,
      regNo: vehicles.regNo,
      type: vehicles.type,
      unit: vehicles.unit,
      driverName: users.name,
      driverServiceNo: users.serviceNo,
      driverUnit: users.unit,
    })
    .from(trips)
    .innerJoin(vehicles, eq(trips.vehicleId, vehicles.id))
    .innerJoin(users, eq(trips.driverId, users.id))
    .where(eq(trips.id, tripId))
    .limit(1);
  if (!head.length) return NextResponse.json({ error: "trip not found" }, { status: 404 });
  const t = head[0];

  const allPts = await db
    .select({ lat: positions.lat, lng: positions.lng, speed: positions.speed, ts: positions.ts })
    .from(positions)
    .where(eq(positions.tripId, tripId))
    .orderBy(asc(positions.ts), asc(positions.id));

  // Decimate to at most 400 points for the map.
  const stride = Math.max(1, Math.ceil(allPts.length / 400));
  const path = allPts.filter((_, i) => i % stride === 0 || i === allPts.length - 1);

  const maxSpeed = allPts.reduce((m, p) => Math.max(m, p.speed || 0), 0);
  const distanceKm = path.reduce((acc, p, i) => {
    if (i === 0) return 0;
    const a = path[i - 1];
    return acc + haversine(a.lat, a.lng, p.lat, p.lng);
  }, 0);

  // Gate scans for the trip's vehicle within its time window (+/- 5 min).
  const start = new Date(t.startedAt.getTime() - 5 * 60 * 1000);
  const end = t.endedAt ? new Date(t.endedAt.getTime() + 5 * 60 * 1000) : new Date();
  const tripVehicleId = await db
    .select({ vehicleId: trips.vehicleId })
    .from(trips)
    .where(eq(trips.id, tripId))
    .limit(1);
  const vid = tripVehicleId[0]?.vehicleId;
  const gates = vid
    ? await db
        .select({
          id: gateEvents.id,
          direction: gateEvents.direction,
          photoUrl: gateEvents.photoUrl,
          plateText: gateEvents.plateText,
          confidence: gateEvents.confidence,
          ts: gateEvents.ts,
        })
        .from(gateEvents)
        .where(
          and(
            eq(gateEvents.vehicleId, vid),
            gte(gateEvents.ts, start),
            lte(gateEvents.ts, end)
          )
        )
        .orderBy(asc(gateEvents.ts))
    : [];

  const tripIncidents = await db
    .select({
      id: incidents.id,
      kind: incidents.kind,
      message: incidents.message,
      ts: incidents.ts,
      resolved: incidents.resolved,
    })
    .from(incidents)
    .where(eq(incidents.tripId, tripId))
    .orderBy(asc(incidents.ts));

  return NextResponse.json({
    trip: {
      ...t,
      distanceKm: Math.round(distanceKm * 10) / 10,
      maxSpeedKmh: Math.round(maxSpeed),
      pointCount: allPts.length,
      durationSec:
        t.endedAt && t.startedAt
          ? Math.round((t.endedAt.getTime() - t.startedAt.getTime()) / 1000)
          : Math.round((Date.now() - t.startedAt.getTime()) / 1000),
    },
    path,
    gates,
    incidents: tripIncidents,
  });
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
