import { NextResponse } from "next/server";
import { db } from "@/db";
import { gateEvents } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** DELETE /api/gate/events?id=123 — officer-only: remove one gate camera capture. */
export async function DELETE(req: Request) {
  const auth = requireRole(req, "officer");
  if ("error" in auth) return auth.error;
  const id = Number(new URL(req.url).searchParams.get("id") || 0);
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  await db.delete(gateEvents).where(eq(gateEvents.id, id));
  return NextResponse.json({ ok: true });
}
