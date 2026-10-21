import { NextResponse } from "next/server";
import { db } from "@/db";
import { trips, vehicles, users, positions, checkpoints, alerts } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { requireRole } from "@/lib/auth";

/**
 * POST /api/trips/action   (driver only, own trip only)
 *   {tripId, action: "complete"}      → end trip, free vehicle
 *   {tripId, action: "checkpoint"}    → log a checkpoint at the last known position
 *   {tripId, action: "sos"}           → raise an SOS alert to command
 */
export async function POST(req: Request) {
  const auth = requireRole(req, "driver");
  if ("error" in auth) return auth.error;

  const body = await req.json().catch(() => ({}));
  const tripId = Number(body.tripId || 0);
  const action = String(body.action || "");
  if (!tripId || !action) {
    return NextResponse.json({ error: "Missing tripId or action" }, { status: 400 });
  }

  const [trip] = await db
    .select({
      id: trips.id,
      status: trips.status,
      vehicleId: trips.vehicleId,
      driverId: trips.driverId,
      regNo: vehicles.regNo,
      driverName: users.name,
    })
    .from(trips)
    .innerJoin(vehicles, eq(trips.vehicleId, vehicles.id))
    .innerJoin(users, eq(trips.driverId, users.id))
    .where(eq(trips.id, tripId));
  if (!trip) return NextResponse.json({ error: "Trip not found" }, { status: 404 });

  // A driver may only act on their own trip
  if (trip.driverId !== auth.user.id) {
    return NextResponse.json({ error: "This is not your trip" }, { status: 403 });
  }

  if (action === "complete") {
    // Repeated STOP presses must not free a vehicle that is on a newer trip
    if (trip.status !== "active") return NextResponse.json({ ok: true, alreadyEnded: true });

    await db
      .update(trips)
      .set({ status: "completed", endedAt: new Date() })
      .where(eq(trips.id, tripId));
    await db.update(vehicles).set({ status: "available" }).where(eq(vehicles.id, trip.vehicleId));
    const { handleTripStopped } = await import("@/lib/ops");
    await handleTripStopped({ tripId, vehicleId: trip.vehicleId, driverId: trip.driverId });
    return NextResponse.json({ ok: true });
  }

  if (trip.status !== "active") {
    return NextResponse.json({ error: "Trip is not active" }, { status: 409 });
  }

  if (action === "checkpoint") {
    const [last] = await db
      .select()
      .from(positions)
      .where(eq(positions.tripId, tripId))
      .orderBy(desc(positions.ts), desc(positions.id))
      .limit(1);
    await db.insert(checkpoints).values({
      tripId,
      lat: last?.lat ?? null,
      lng: last?.lng ?? null,
      note: body.note || "Checkpoint logged",
    });
    return NextResponse.json({ ok: true, checkpoint: last });
  }

  if (action === "sos") {
    await db.insert(alerts).values({
      kind: "sos",
      message: `SOS raised by ${trip.driverName} — vehicle ${trip.regNo} needs immediate assistance`,
      tripId,
      vehicleId: trip.vehicleId,
      driverId: trip.driverId,
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
