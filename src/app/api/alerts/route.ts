import { NextResponse } from "next/server";
import { db } from "@/db";
import { alerts, vehicles, users } from "@/db/schema";
import { eq, desc } from "drizzle-orm";

/** GET /api/alerts → recent alerts joined with vehicle + driver names. */
export async function GET() {
  const rows = await db
    .select({
      id: alerts.id,
      kind: alerts.kind,
      message: alerts.message,
      ts: alerts.ts,
      resolved: alerts.resolved,
      tripId: alerts.tripId,
      vehicleId: alerts.vehicleId,
      driverId: alerts.driverId,
      regNo: vehicles.regNo,
      driverName: users.name,
    })
    .from(alerts)
    .leftJoin(vehicles, eq(alerts.vehicleId, vehicles.id))
    .leftJoin(users, eq(alerts.driverId, users.id))
    .orderBy(desc(alerts.ts), desc(alerts.id))
    .limit(30);
  return NextResponse.json({ alerts: rows });
}

/**
 * POST /api/alerts
 *   {action: "resolve", id}                                   → officer closes an alert
 *   {action: "create", kind, message, tripId?, vehicleId?, driverId?} → JCO escalation
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "");

  if (action === "resolve") {
    const id = Number(body.id || 0);
    if (!id) return NextResponse.json({ error: "Missing alert id" }, { status: 400 });
    await db.update(alerts).set({ resolved: true }).where(eq(alerts.id, id));
    return NextResponse.json({ ok: true });
  }

  if (action === "create") {
    const kind = ["flag", "delay", "breakdown", "sos"].includes(body.kind) ? body.kind : "flag";
    const message = String(body.message || "Flagged by JCO for command review");
    const [a] = await db
      .insert(alerts)
      .values({
        kind,
        message,
        tripId: body.tripId ? Number(body.tripId) : null,
        vehicleId: body.vehicleId ? Number(body.vehicleId) : null,
        driverId: body.driverId ? Number(body.driverId) : null,
      })
      .returning();
    return NextResponse.json({ ok: true, alert: a });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
