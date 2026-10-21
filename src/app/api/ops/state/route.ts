import { NextResponse } from "next/server";
import { buildOpsState } from "@/lib/ops";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** GET /api/ops/state — MT Park dashboard data (also runs the rule engine). Admin + JCO. */
export async function GET(req: Request) {
  const a = requireRole(req, "officer", "jco");
  if ("error" in a) return a.error;
  try {
    const state = await buildOpsState();
    return NextResponse.json(state);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "ops state failed" }, { status: 500 });
  }
}
