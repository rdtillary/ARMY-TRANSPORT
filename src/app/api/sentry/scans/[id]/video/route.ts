import { NextResponse } from "next/server";
import { db } from "@/db";
import { sentryScans } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** GET /api/sentry/scans/:id/video — streams the footage with HTTP Range support (needed for <video>). */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = requireRole(req, "sentry", "officer");
  if ("error" in a) return a.error;
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "Bad id" }, { status: 400 });

  const [row] = await db
    .select({ data: sentryScans.videoData, mime: sentryScans.videoMime })
    .from(sentryScans)
    .where(eq(sentryScans.id, id));
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const buf = row.data;
  const size = buf.length;
  const base = {
    "Content-Type": row.mime,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=3600",
  };

  const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") || "");
  if (!m) return new Response(new Uint8Array(buf), { headers: { ...base, "Content-Length": String(size) } });

  let start = m[1] ? parseInt(m[1], 10) : size - parseInt(m[2] || "0", 10);
  let end = m[1] && m[2] ? parseInt(m[2], 10) : size - 1;
  if (!(start >= 0) || start >= size) {
    return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
  }
  end = Math.min(end, size - 1);
  return new Response(new Uint8Array(buf.subarray(start, end + 1)), {
    status: 206,
    headers: { ...base, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) },
  });
}
