import { NextResponse } from "next/server";
import { db } from "@/db";
import { users, trips, vehicles } from "@/db/schema";
import { eq, desc, asc } from "drizzle-orm";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const driverId = searchParams.get("driverId");

  if (driverId) {
    const rows = await db
      .select({
        id: trips.id,
        status: trips.status,
        startedAt: trips.startedAt,
        endedAt: trips.endedAt,
        vehicleNumber: vehicles.regNo,
        vehicleType: vehicles.type,
        unit: vehicles.unit,
      })
      .from(trips)
      .leftJoin(vehicles, eq(trips.vehicleId, vehicles.id))
      .where(eq(trips.driverId, Number(driverId)))
      .orderBy(desc(trips.startedAt));

    return NextResponse.json({
      trips: rows.map((trip) => ({
        id: trip.id,
        status: trip.status,
        vehicleNumber: trip.vehicleNumber || "—",
        vehicleType: trip.vehicleType || "Unknown",
        startedAt: trip.startedAt,
        endedAt: trip.endedAt,
        unit: trip.unit || "Unassigned",
      })),
    });
  }

  const allDrivers = await db
    .select({
      id: users.id,
      name: users.name,
      serviceNo: users.serviceNo,
      unit: users.unit,
    })
    .from(users)
    .where(eq(users.role, "driver"))
    .orderBy(asc(users.name));

  const activeTrips = await db
    .select({
      driverId: trips.driverId,
      tripId: trips.id,
      vehicleNumber: vehicles.regNo,
      vehicleType: vehicles.type,
      startedAt: trips.startedAt,
    })
    .from(trips)
    .leftJoin(vehicles, eq(trips.vehicleId, vehicles.id))
    .where(eq(trips.status, "active"));

  const driversWithStatus = allDrivers.map((driver) => {
    const activeTrip = activeTrips.find((trip) => trip.driverId === driver.id);

    return {
      ...driver,
      status: activeTrip ? "On Duty" : "Idle",
      currentVehicle: activeTrip
        ? `${activeTrip.vehicleNumber || "Vehicle"}${activeTrip.vehicleType ? ` (${activeTrip.vehicleType})` : ""}`
        : null,
      activeTripId: activeTrip?.tripId ?? null,
      currentTripStartedAt: activeTrip?.startedAt ?? null,
    };
  });

  return NextResponse.json({ drivers: driversWithStatus });
}
