import { NextResponse } from "next/server";
import { db } from "@/db";
import { sentryScans } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireRole } from "@/lib/auth";

/** DELETE /api/sentry/scans/:id — Sentry + Admin */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = requireRole(req, "sentry", "officer");
  if ("error" in a) return a.error;
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "Bad id" }, { status: 400 });
  await db.delete(sentryScans).where(eq(sentryScans.id, id));
  return NextResponse.json({ ok: true });
}
