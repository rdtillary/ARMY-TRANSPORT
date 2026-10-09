import { NextResponse } from "next/server";
import { db } from "@/db";
import { trips, positions } from "@/db/schema";
import { eq } from "drizzle-orm";

const num = (v: unknown) => (v != null && isFinite(Number(v)) ? Number(v) : null);

/**
 * POST /api/trips/track
 *   single point: {tripId, lat, lng, speed, heading, accuracy, ts?}
 *   batch:        {tripId, points: [{lat, lng, speed, heading, accuracy, ts?}, ...]}
 * `ts` is the time (ms since epoch) the fix was captured on the phone. Batches
 * let the app upload positions recorded while it was asleep or offline.
 */
export async function POST(req: Request) {
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
      // Trust the phone's capture time only if it is plausible.
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
  if (!trip || trip.status !== "active") {
    return NextResponse.json({ error: "Trip is not active" }, { status: 409 });
  }

  pts.sort((a, b) => a.ts.getTime() - b.ts.getTime());

  await db.insert(positions).values(
    pts.map((p) => ({
      tripId,
      vehicleId: trip.vehicleId,
      ...p,
    }))
  );

  // GPS points are retained permanently so the Trip Archive can replay
  // complete routes. (Notifications table is pruned separately in ops.ts.)

  return NextResponse.json({ ok: true, saved: pts.length });
}
