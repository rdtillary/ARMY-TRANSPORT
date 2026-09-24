import { NextResponse } from "next/server";
import { buildOpsState } from "@/lib/ops";

export const dynamic = "force-dynamic";

/** GET /api/ops/state — MT Park dashboard data (also runs the rule engine). */
export async function GET() {
  try {
    const state = await buildOpsState();
    return NextResponse.json(state);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "ops state failed" }, { status: 500 });
  }
}
