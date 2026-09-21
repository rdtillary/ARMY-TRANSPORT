import { NextResponse } from "next/server";
import { db } from "@/db";
import { trips, positions } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

/** POST /api/trips/track {tripId, lat, lng, speed, heading, accuracy} */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const tripId = Number(body.tripId || 0);
  const lat = Number(body.lat);
  const lng = Number(body.lng);
  if (!tripId || !isFinite(lat) || !isFinite(lng)) {
    return NextResponse.json({ error: "Bad position" }, { status: 400 });
  }

  const [trip] = await db.select().from(trips).where(eq(trips.id, tripId));
  if (!trip || trip.status !== "active") {
    return NextResponse.json({ error: "Trip is not active" }, { status: 409 });
  }

  await db.insert(positions).values({
    tripId,
    vehicleId: trip.vehicleId,
    lat,
    lng,
    speed: body.speed != null && isFinite(Number(body.speed)) ? Number(body.speed) : null,
    heading: body.heading != null && isFinite(Number(body.heading)) ? Number(body.heading) : null,
    accuracy: body.accuracy != null && isFinite(Number(body.accuracy)) ? Number(body.accuracy) : null,
  });

  // Keep only the last 6 hours of raw GPS points.
  await db.delete(positions).where(sql`ts < now() - interval '6 hours'`);

  return NextResponse.json({ ok: true });
}
