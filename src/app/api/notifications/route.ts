import { NextResponse } from "next/server";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { desc, inArray, and } from "drizzle-orm";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Notification targets visible to the logged-in user (taken from the login, not the URL). */
function targetsFor(user: { id: number; role: string }): string[] {
  const t = ["all", user.role];
  if (user.role === "officer") t.push("admin"); // ops.ts writes admin alarms with target "admin"
  if (user.role === "driver") t.push(`driver:${user.id}`);
  return t;
}

/** GET /api/notifications → latest 40 notifications for the logged-in user. */
export async function GET(req: Request) {
  const a = requireRole(req);
  if ("error" in a) return a.error;

  const rows = await db
    .select()
    .from(notifications)
    .where(inArray(notifications.target, targetsFor(a.user)))
    .orderBy(desc(notifications.ts), desc(notifications.id))
    .limit(40);

  return NextResponse.json({ notifications: rows });
}

/**
 * POST /api/notifications
 *   {action: "read", ids: number[]}   → mark specific ones read (own inbox only)
 *   {action: "readAll"}               → mark the whole inbox read
 */
export async function POST(req: Request) {
  const a = requireRole(req);
  if ("error" in a) return a.error;

  const body = await req.json().catch(() => ({}));
  const targets = targetsFor(a.user);

  if (body.action === "read" && Array.isArray(body.ids) && body.ids.length) {
    const ids = body.ids.map((x: unknown) => Number(x)).filter((x: number) => Number.isInteger(x));
    if (ids.length) {
      await db
        .update(notifications)
        .set({ read: true })
        .where(and(inArray(notifications.id, ids), inArray(notifications.target, targets)));
    }
    return NextResponse.json({ ok: true });
  }
  if (body.action === "readAll") {
    await db.update(notifications).set({ read: true }).where(inArray(notifications.target, targets));
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
