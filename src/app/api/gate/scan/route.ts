import { NextResponse } from "next/server";
import { db } from "@/db";
import { vehicles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { gateScan } from "@/lib/ops";

export const dynamic = "force-dynamic";

/**
 * POST /api/gate/scan
 *   {vehicleId, direction?: "in"|"out"}   direction auto-toggles if omitted
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const vehicleId = Number(body.vehicleId || 0);
  if (!vehicleId) return NextResponse.json({ error: "vehicleId required" }, { status: 400 });

  const [v] = await db.select().from(vehicles).where(eq(vehicles.id, vehicleId));
  if (!v) return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });

  const direction = body.direction === "in" || body.direction === "out"
    ? body.direction
    : v.parkStatus === "in"
      ? "out"
      : "in";

  try {
    const { event } = await gateScan({ vehicleId, direction });
    return NextResponse.json({ ok: true, event });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "scan failed" }, { status: 409 });
  }
}
