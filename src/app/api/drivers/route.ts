import { NextResponse } from "next/server";
import { db } from "@/db";
import { users, trips, vehicles } from "@/db/schema";
import { eq, and, desc, asc, sql } from "drizzle-orm";
import { ensureSchema } from "@/db/migrate";

export const dynamic = "force-dynamic";

/**
 * GET /api/drivers
 * Returns all drivers with:
 * - their last vehicle (reg no + type from most recent trip)
 * - total trips completed
 * - photo URL if uploaded
 */
export async function GET() {
  try {
    await ensureSchema();
    // Get all drivers
    const drivers = await db
      .select({
        id: users.id,
        name: users.name,
        serviceNo: users.serviceNo,
        unit: users.unit,
        photoUrl: users.photoUrl,
      })
      .from(users)
      .where(eq(users.role, "driver"))
      .orderBy(asc(users.name));

    // For each driver get their last vehicle and trip count
    const enriched = await Promise.all(
      drivers.map(async (d) => {
        // Last trip with vehicle details
        const lastTrip = await db
          .select({
            tripId: trips.id,
            startedAt: trips.startedAt,
            regNo: vehicles.regNo,
            type: vehicles.type,
            status: trips.status,
          })
          .from(trips)
          .innerJoin(vehicles, eq(trips.vehicleId, vehicles.id))
          .where(eq(trips.driverId, d.id))
          .orderBy(desc(trips.startedAt), desc(trips.id))
          .limit(1);

        // Total completed trips
        const countResult = await db
          .select({ count: sql<number>`cast(count(*) as int)` })
          .from(trips)
          .where(and(eq(trips.driverId, d.id), eq(trips.status, "completed")));

        return {
          ...d,
          lastVehicleRegNo: lastTrip[0]?.regNo ?? null,
          lastVehicleType: lastTrip[0]?.type ?? null,
          lastTripAt: lastTrip[0]?.startedAt ?? null,
          tripsCompleted: countResult[0]?.count ?? 0,
        };
      })
    );

    return NextResponse.json({ drivers: enriched });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed" }, { status: 500 });
  }
}

/**
 * PATCH /api/drivers
 * Body: { driverId: number, photoUrl: string (base64 data URL) }
 * Uploads or replaces a driver's photo.
 */
export async function PATCH(req: Request) {
  try {
    await ensureSchema();
    const body = await req.json().catch(() => ({}));
    const driverId = Number(body.driverId || 0);
    const photoUrl = String(body.photoUrl || "").trim();

    if (!driverId) return NextResponse.json({ error: "driverId required" }, { status: 400 });
    if (!photoUrl) return NextResponse.json({ error: "photoUrl required" }, { status: 400 });
    if (photoUrl.length > 5 * 1024 * 1024)
      return NextResponse.json({ error: "Photo too large (max ~4 MB)" }, { status: 400 });

    await db.update(users).set({ photoUrl }).where(eq(users.id, driverId));
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed" }, { status: 500 });
  }
}
