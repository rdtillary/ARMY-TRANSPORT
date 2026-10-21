import { NextResponse } from "next/server";
import { db } from "@/db";
import { ensureSchema } from "@/db/migrate";
import { sentryScans, users } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

const MAX_VIDEO = 80 * 1024 * 1024; // 80 MB

/** GET /api/sentry/scans → scan list (no video bytes). Sentry + Admin. */
export async function GET(req: Request) {
  const a = requireRole(req, "sentry", "officer");
  if ("error" in a) return a.error;
  await ensureSchema();
  const rows = await db
    .select({
      id: sentryScans.id,
      label: sentryScans.label,
      uploadedBy: sentryScans.uploadedBy,
      videoSize: sentryScans.videoSize,
      stitchedUrl: sentryScans.stitchedUrl,
      frames: sentryScans.frames,
      durationSec: sentryScans.durationSec,
      ts: sentryScans.ts,
    })
    .from(sentryScans)
    .orderBy(desc(sentryScans.ts), desc(sentryScans.id))
    .limit(50);
  return NextResponse.json({ scans: rows });
}

/**
 * POST /api/sentry/scans  (multipart)
 *   video: File, stitched: File (jpeg, produced in the browser), label, frames, duration
 */
export async function POST(req: Request) {
  const a = requireRole(req, "sentry", "officer");
  if ("error" in a) return a.error;
  await ensureSchema();

  const form = await req.formData().catch(() => null);
  const video = form?.get("video");
  const stitched = form?.get("stitched");
  if (!(video instanceof File) || !(stitched instanceof File))
    return NextResponse.json({ error: "Footage and stitched image are required" }, { status: 400 });
  if (!video.type.startsWith("video/"))
    return NextResponse.json({ error: "Upload a video file" }, { status: 400 });
  if (video.size > MAX_VIDEO)
    return NextResponse.json({ error: "Footage too large (max 80 MB)" }, { status: 413 });
  if (stitched.size > 12 * 1024 * 1024)
    return NextResponse.json({ error: "Stitched image too large" }, { status: 413 });

  const [u] = await db.select({ name: users.name }).from(users).where(eq(users.id, a.user.id));
  const label = String(form?.get("label") || video.name || "Scan").slice(0, 120);
  const stitchedUrl = `data:image/jpeg;base64,${Buffer.from(await stitched.arrayBuffer()).toString("base64")}`;

  const [row] = await db
    .insert(sentryScans)
    .values({
      label,
      uploadedBy: u?.name || "Sentry",
      videoMime: video.type,
      videoSize: video.size,
      videoData: Buffer.from(await video.arrayBuffer()),
      stitchedUrl,
      frames: Math.max(0, Math.round(Number(form?.get("frames")) || 0)),
      durationSec: Math.max(0, Number(form?.get("duration")) || 0),
    })
    .returning({ id: sentryScans.id });
  return NextResponse.json({ ok: true, id: row.id });
}
