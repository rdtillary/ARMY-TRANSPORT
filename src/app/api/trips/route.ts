import { NextResponse } from "next/server";
import { db } from "@/db";
import { trips, vehicles, users, positions } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { handleTripStarted } from "@/lib/ops";
import { requireRole } from "@/lib/auth";

/** GET /api/trips → the logged-in driver's currently active trip (if any). */
export async function GET(req: Request) {
  const a = requireRole(req, "driver");
  if ("error" in a) return a.error;
  const userId = a.user.id; // always the caller — a driver cannot look at someone else's trip

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

/** POST /api/trips {vehicleId, lat, lng} → start a tracked trip for the logged-in driver. */
export async function POST(req: Request) {
  const a = requireRole(req, "driver");
  if ("error" in a) return a.error;

  const body = await req.json().catch(() => ({}));
  const driverId = a.user.id; // taken from the login, NOT from the request body
  const vehicleId = Number(body.vehicleId || 0);
  const lat = Number(body.lat);
  const lng = Number(body.lng);
  if (!vehicleId || !isFinite(lat) || !isFinite(lng)) {
    return NextResponse.json({ error: "Missing vehicle or position" }, { status: 400 });
  }

  // A driver can only have one active trip at a time
  const mine = await db
    .select({ id: trips.id })
    .from(trips)
    .where(and(eq(trips.driverId, driverId), eq(trips.status, "active")))
    .limit(1);
  if (mine.length) {
    return NextResponse.json({ error: "You already have an active trip — stop it first" }, { status: 409 });
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
