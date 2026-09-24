import { NextResponse } from "next/server";
import { db } from "@/db";
import { trips, vehicles, users, positions, checkpoints, alerts } from "@/db/schema";
import { eq, desc } from "drizzle-orm";

/**
 * POST /api/trips/action
 *   {tripId, action: "complete"}      → end trip, free vehicle
 *   {tripId, action: "checkpoint"}    → log a checkpoint at the last known position
 *   {tripId, action: "sos"}           → raise an SOS alert to command
 */
export async function POST(req: Request) {
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

  if (action === "complete") {
    await db
      .update(trips)
      .set({ status: "completed", endedAt: new Date() })
      .where(eq(trips.id, tripId));
    await db.update(vehicles).set({ status: "available" }).where(eq(vehicles.id, trip.vehicleId));
    // MT Park rule engine: rule 3 (stopped while OUT) is raised here.
    const { handleTripStopped } = await import("@/lib/ops");
    await handleTripStopped({ tripId, vehicleId: trip.vehicleId, driverId: trip.driverId });
    return NextResponse.json({ ok: true });
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
