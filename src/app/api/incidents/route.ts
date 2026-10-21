import { NextResponse } from "next/server";
import { db } from "@/db";
import { incidents } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** POST /api/incidents {id} — acknowledge/resolve an alarm. Admin + JCO. */
export async function POST(req: Request) {
  const a = requireRole(req, "officer", "jco");
  if ("error" in a) return a.error;

  const body = await req.json().catch(() => ({}));
  const id = Number(body.id || 0);
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await db
    .update(incidents)
    .set({ resolved: true, resolvedAt: new Date() })
    .where(eq(incidents.id, id));
  return NextResponse.json({ ok: true });
}
