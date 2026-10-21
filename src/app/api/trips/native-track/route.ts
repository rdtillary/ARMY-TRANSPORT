import { NextResponse } from "next/server";
import { db } from "@/db";
import { trips, positions } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const num = (v: unknown) => (v != null && isFinite(Number(v)) ? Number(v) : null);

/**
 * POST /api/trips/native-track?tripId=123
 * Called directly by the Android background service (no WebView involved).
 * Body is the plugin's location object:
 *   {latitude, longitude, accuracy, speed (m/s), bearing, time (ms), source:"native"}
 * Auth: Authorization: Bearer <login token> (driver who owns the trip).
 */
export async function POST(req: Request) {
  const a = requireRole(req, "driver");
  if ("error" in a) return a.error;

  const tripId = Number(new URL(req.url).searchParams.get("tripId") || 0);
  if (!tripId) return NextResponse.json({ error: "tripId required" }, { status: 400 });

  const b = await req.json().catch(() => ({}));
  const lat = Number(b.latitude);
  const lng = Number(b.longitude);
  if (!isFinite(lat) || !isFinite(lng)) {
    return NextResponse.json({ error: "Bad position" }, { status: 400 });
  }

  const [trip] = await db.select().from(trips).where(eq(trips.id, tripId));
  if (!trip || trip.status !== "active") {
    return NextResponse.json({ error: "Trip is not active" }, { status: 409 });
  }
  if (trip.driverId !== a.user.id) {
    return NextResponse.json({ error: "Not your trip" }, { status: 403 });
  }

  const now = Date.now();
  let t = Number(b.time);
  if (!isFinite(t) || t > now + 60_000 || t < now - 24 * 3600_000) t = now;
  const ts = new Date(t);

  // The same fix may also arrive through the app's own upload queue — skip duplicates.
  const dup = await db
    .select({ id: positions.id })
    .from(positions)
    .where(and(eq(positions.tripId, tripId), eq(positions.ts, ts)))
    .limit(1);
  if (dup.length) return NextResponse.json({ ok: true, saved: 0 });

  const speedMs = num(b.speed);
  await db.insert(positions).values({
    tripId,
    vehicleId: trip.vehicleId,
    lat,
    lng,
    speed: speedMs != null && speedMs >= 0 ? speedMs * 3.6 : null,
    heading: num(b.bearing),
    accuracy: num(b.accuracy),
    ts,
  });

  return NextResponse.json({ ok: true, saved: 1 });
}
