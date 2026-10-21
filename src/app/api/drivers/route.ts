import { NextResponse } from "next/server";
import { db } from "@/db";
import { users, trips, vehicles } from "@/db/schema";
import { eq, and, desc, asc, sql } from "drizzle-orm";
import { ensureSchema } from "@/db/migrate";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** GET /api/drivers — Admin only. All drivers with last vehicle + trip count. */
export async function GET(req: Request) {
  const a = requireRole(req, "officer");
  if ("error" in a) return a.error;
  try {
    await ensureSchema();
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

    const enriched = await Promise.all(
      drivers.map(async (d) => {
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

/** PATCH /api/drivers — Admin only. Body: { driverId, photoUrl (data URL) } */
export async function PATCH(req: Request) {
  const a = requireRole(req, "officer");
  if ("error" in a) return a.error;
  try {
    await ensureSchema();
    const body = await req.json().catch(() => ({}));
    const driverId = Number(body.driverId || 0);
    const photoUrl = String(body.photoUrl || "").trim();

    if (!driverId) return NextResponse.json({ error: "driverId required" }, { status: 400 });
    if (!photoUrl) return NextResponse.json({ error: "photoUrl required" }, { status: 400 });
    if (!photoUrl.startsWith("data:image/"))
      return NextResponse.json({ error: "photoUrl must be an image" }, { status: 400 });
    if (photoUrl.length > 5 * 1024 * 1024)
      return NextResponse.json({ error: "Photo too large (max ~4 MB)" }, { status: 400 });

    await db.update(users).set({ photoUrl }).where(eq(users.id, driverId));
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed" }, { status: 500 });
  }
}
