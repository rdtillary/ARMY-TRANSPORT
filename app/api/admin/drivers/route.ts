import { NextResponse } from 'next/server';
import { db } from '@/db';
import { users, trips, vehicles } from '@/db/schema';
import { eq, and } from 'drizzle-orm';

export async function GET() {
  try {
    // 1. Fetch all registered drivers
    const allDrivers = await db
      .select({
        id: users.id,
        name: users.name,
        serviceNumber: users.serviceNumber,
        phone: users.phone,
      })
      .from(users)
      .where(eq(users.role, 'driver'));

    // 2. Fetch all currently active trips with vehicle details
    const activeTrips = await db
      .select({
        driverId: trips.driverId,
        tripId: trips.id,
        vehicleNumber: vehicles.registrationNumber,
        vehicleModel: vehicles.model,
        startTime: trips.startTime,
      })
      .from(trips)
      .leftJoin(vehicles, eq(trips.vehicleId, vehicles.id))
      .where(eq(trips.status, 'active'));

    // 3. Map status to drivers
    const driversWithStatus = allDrivers.map((driver) => {
      const activeTrip = activeTrips.find((t) => t.driverId === driver.id);
      return {
        ...driver,
        status: activeTrip ? 'On Duty' : 'Idle',
        currentVehicle: activeTrip
          ? `${activeTrip.vehicleNumber} (${activeTrip.vehicleModel || 'Vehicle'})`
          : null,
        activeTripId: activeTrip?.tripId || null,
      };
    });

    return NextResponse.json({ drivers: driversWithStatus });
  } catch (error) {
    console.error('Error fetching drivers:', error);
    return NextResponse.json({ error: 'Failed to fetch drivers' }, { status: 500 });
  }
}
