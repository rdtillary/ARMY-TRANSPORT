import { NextResponse } from "next/server";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { desc, inArray } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * GET /api/notifications?userId=..&role=driver|jco|officer
 * Returns the latest 40 notifications addressed to this terminal/user.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const userId = Number(url.searchParams.get("userId") || 0);
  const role = url.searchParams.get("role") || "driver";

  const targets = ["all", role];
  if (role === "driver" && userId) targets.push(`driver:${userId}`);

  const rows = await db
    .select()
    .from(notifications)
    .where(inArray(notifications.target, targets))
    .orderBy(desc(notifications.ts), desc(notifications.id))
    .limit(40);

  return NextResponse.json({ notifications: rows });
}

/**
 * POST /api/notifications
 *   {action: "read", ids: number[]}        → mark specific ones read
 *   {action: "readAll", userId, role}      → mark the whole inbox read
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  if (body.action === "read" && Array.isArray(body.ids) && body.ids.length) {
    await db.update(notifications).set({ read: true }).where(inArray(notifications.id, body.ids));
    return NextResponse.json({ ok: true });
  }
  if (body.action === "readAll") {
    const userId = Number(body.userId || 0);
    const role = String(body.role || "driver");
    const targets = ["all", role];
    if (role === "driver" && userId) targets.push(`driver:${userId}`);
    await db
      .update(notifications)
      .set({ read: true })
      .where(inArray(notifications.target, targets));
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
