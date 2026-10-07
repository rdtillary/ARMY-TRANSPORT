import { NextResponse } from 'next/server';
import { db } from '@/db';
import { users, trips, vehicles } from '@/db/schema';
import { eq, asc } from 'drizzle-orm';

export async function GET() {
  try {
    const allDrivers = await db
      .select({
        id: users.id,
        name: users.name,
        serviceNo: users.serviceNo,
        unit: users.unit,
      })
      .from(users)
      .where(eq(users.role, 'driver'))
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
      .where(eq(trips.status, 'active'));

    const driversWithStatus = allDrivers.map((driver) => {
      const activeTrip = activeTrips.find((t) => t.driverId === driver.id);

      return {
        ...driver,
        status: activeTrip ? 'On Duty' : 'Idle',
        currentVehicle: activeTrip
          ? `${activeTrip.vehicleNumber || 'Vehicle'}${activeTrip.vehicleType ? ` (${activeTrip.vehicleType})` : ''}`
          : null,
        activeTripId: activeTrip?.tripId ?? null,
        currentTripStartedAt: activeTrip?.startedAt ?? null,
      };
    });

    return NextResponse.json({ drivers: driversWithStatus });
  } catch (error) {
    console.error('Error fetching drivers:', error);
    return NextResponse.json({ error: 'Failed to fetch drivers' }, { status: 500 });
  }
}
