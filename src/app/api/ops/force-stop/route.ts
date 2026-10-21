import { NextResponse } from "next/server";
import { adminForceStopTracking } from "@/lib/ops";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/ops/force-stop
 * Body: { vehicleId: number }
 * Admin only — force-stops an active trip.
 */
export async function POST(req: Request) {
  const a = requireRole(req, "officer");
  if ("error" in a) return a.error;
  try {
    const body = await req.json().catch(() => ({}));
    const vehicleId = Number(body.vehicleId || 0);
    if (!vehicleId)
      return NextResponse.json({ error: "vehicleId required" }, { status: 400 });
    const result = await adminForceStopTracking(vehicleId);
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Force stop failed" }, { status: 409 });
  }
}
