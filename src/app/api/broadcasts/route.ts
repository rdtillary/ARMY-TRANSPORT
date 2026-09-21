import { NextResponse } from "next/server";
import { db } from "@/db";
import { broadcasts } from "@/db/schema";
import { desc } from "drizzle-orm";

/** GET /api/broadcasts → latest 10 command broadcasts. */
export async function GET() {
  const rows = await db.select().from(broadcasts).orderBy(desc(broadcasts.ts), desc(broadcasts.id)).limit(10);
  return NextResponse.json({ broadcasts: rows });
}

/** POST /api/broadcasts {fromName, to: "jco"|"driver"|"all", message} */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const fromName = String(body.fromName || "Command");
  const to = ["jco", "driver", "all"].includes(body.to) ? body.to : "all";
  const message = String(body.message || "").trim();
  if (!message) return NextResponse.json({ error: "Message is empty" }, { status: 400 });
  const [b] = await db.insert(broadcasts).values({ fromName, to, message }).returning();
  return NextResponse.json({ ok: true, broadcast: b });
}
