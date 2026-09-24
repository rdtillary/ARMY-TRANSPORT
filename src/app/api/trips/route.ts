import { NextResponse } from "next/server";
import { db } from "@/db";
import { trips, vehicles, users, positions } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { handleTripStarted } from "@/lib/ops";

/** GET /api/trips?userId=.. → the driver's currently active trip (if any). */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const userId = Number(url.searchParams.get("userId") || 0);
  if (!userId) return NextResponse.json({ trip: null });
  const rows = await db
    .select({
      tripId: trips.id,
      vehicleId: trips.vehicleId,
      startedAt: trips.startedAt,
      regNo: vehicles.regNo,
      type: vehicles.type,
      driverName: users.name,
    })
    .from(trips)
    .innerJoin(vehicles, eq(trips.vehicleId, vehicles.id))
    .innerJoin(users, eq(trips.driverId, users.id))
    .where(and(eq(trips.status, "active"), eq(trips.driverId, userId)))
    .limit(1);
  const r = rows[0];
  if (!r) return NextResponse.json({ trip: null });
  return NextResponse.json({
    trip: {
      id: r.tripId,
      vehicleId: r.vehicleId,
      startedAt: r.startedAt,
      regNo: r.regNo,
      type: r.type,
      driverName: r.driverName,
    },
  });
}

/** POST /api/trips {driverId, vehicleId, lat, lng} → start a tracked trip. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const driverId = Number(body.driverId || 0);
  const vehicleId = Number(body.vehicleId || 0);
  const lat = Number(body.lat);
  const lng = Number(body.lng);
  if (!driverId || !vehicleId || !isFinite(lat) || !isFinite(lng)) {
    return NextResponse.json({ error: "Missing driver, vehicle or position" }, { status: 400 });
  }

  const [vehicle] = await db.select().from(vehicles).where(eq(vehicles.id, vehicleId));
  if (!vehicle) return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });
  if (vehicle.status === "maintenance") {
    return NextResponse.json({ error: `Vehicle ${vehicle.regNo} is under maintenance` }, { status: 409 });
  }
  if (vehicle.status === "active") {
    return NextResponse.json({ error: `Vehicle ${vehicle.regNo} is already on a trip` }, { status: 409 });
  }

  const [trip] = await db
    .insert(trips)
    .values({ driverId, vehicleId })
    .returning({ id: trips.id, startedAt: trips.startedAt });

  await db
    .insert(positions)
    .values({ tripId: trip.id, vehicleId, lat, lng, accuracy: body.accuracy != null ? Number(body.accuracy) : null });

  await db
    .update(vehicles)
    .set({ status: "active" })
    .where(eq(vehicles.id, vehicleId));

  // MT Park rule engine: clears "tracking OFF while OUT" alarms, arms others.
  await handleTripStarted({ tripId: trip.id, vehicleId, driverId });

  return NextResponse.json({
    trip: {
      id: trip.id,
      vehicleId,
      startedAt: trip.startedAt,
      regNo: vehicle.regNo,
      type: vehicle.type,
      driverName: "",
    },
  });
}
