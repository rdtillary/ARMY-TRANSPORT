import { NextResponse } from "next/server";
import { db } from "@/db";
import { broadcasts } from "@/db/schema";
import { desc } from "drizzle-orm";
import { requireRole } from "@/lib/auth";

/** GET /api/broadcasts → latest 10 command broadcasts. Any logged-in user. */
export async function GET(req: Request) {
  const a = requireRole(req);
  if ("error" in a) return a.error;
  const rows = await db.select().from(broadcasts).orderBy(desc(broadcasts.ts), desc(broadcasts.id)).limit(10);
  return NextResponse.json({ broadcasts: rows });
}

/** POST /api/broadcasts {fromName, to: "sentry"|"driver"|"all", message} — Admin only */
export async function POST(req: Request) {
  const a = requireRole(req, "officer");
  if ("error" in a) return a.error;

  const body = await req.json().catch(() => ({}));
  const fromName = String(body.fromName || "Command").slice(0, 80);
  const to = ["sentry", "driver", "all"].includes(body.to) ? body.to : "all";
  const message = String(body.message || "").trim().slice(0, 1000);
  if (!message) return NextResponse.json({ error: "Message is empty" }, { status: 400 });
  const [b] = await db.insert(broadcasts).values({ fromName, to, message }).returning();
  return NextResponse.json({ ok: true, broadcast: b });
}
