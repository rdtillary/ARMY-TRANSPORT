import { NextResponse } from "next/server";
import { db } from "@/db";
import { trips, positions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireRole } from "@/lib/auth";

const num = (v: unknown) => (v != null && isFinite(Number(v)) ? Number(v) : null);

/**
 * POST /api/trips/track   (driver only, own trip only)
 *   single point: {tripId, lat, lng, speed, heading, accuracy, ts?}
 *   batch:        {tripId, points: [{lat, lng, speed, heading, accuracy, ts?}, ...]}
 */
export async function POST(req: Request) {
  const a = requireRole(req, "driver");
  if ("error" in a) return a.error;

  const body = await req.json().catch(() => ({}));
  const tripId = Number(body.tripId || 0);
  if (!tripId) {
    return NextResponse.json({ error: "Bad position" }, { status: 400 });
  }

  const raw: any[] = Array.isArray(body.points) ? body.points.slice(0, 500) : [body];

  const now = Date.now();
  const MAX_AGE = 24 * 60 * 60 * 1000;
  const pts = raw
    .map((p) => {
      const lat = Number(p?.lat);
      const lng = Number(p?.lng);
      if (!isFinite(lat) || !isFinite(lng)) return null;
      let t = Number(p?.ts);
      if (!isFinite(t) || t > now + 60_000 || t < now - MAX_AGE) t = now;
      return {
        lat,
        lng,
        speed: num(p?.speed),
        heading: num(p?.heading),
        accuracy: num(p?.accuracy),
        ts: new Date(t),
      };
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);

  if (pts.length === 0) {
    return NextResponse.json({ error: "Bad position" }, { status: 400 });
  }

  const [trip] = await db.select().from(trips).where(eq(trips.id, tripId));
  if (!trip) return NextResponse.json({ error: "Trip is not active" }, { status: 409 });
  if (trip.driverId !== a.user.id) {
    return NextResponse.json({ error: "This is not your trip" }, { status: 403 });
  }
  if (trip.status !== "active") {
    return NextResponse.json({ error: "Trip is not active" }, { status: 409 });
  }

  pts.sort((x, y) => x.ts.getTime() - y.ts.getTime());

  await db.insert(positions).values(
    pts.map((p) => ({
      tripId,
      vehicleId: trip.vehicleId,
      ...p,
    }))
  );

  return NextResponse.json({ ok: true, saved: pts.length });
}
