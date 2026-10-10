import { NextResponse } from "next/server";
import { db } from "@/db";
import { vehicles } from "@/db/schema";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { gateScan } from "@/lib/ops";
import { recognizePlate, compactPlate, scorePlate } from "@/lib/anpr";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Lowered from 0.85 to 0.70 for real gate camera conditions where
// the plate is small in a full scene photo (IP camera at gate)
const AUTO_LOG_SCORE_THRESHOLD = 0.70;

/**
 * POST /api/gate/scan
 *
 * A) JSON (manual table button):
 *      {vehicleId, direction?, plateText?, confidence?}
 *
 * B) multipart/form-data (webcam auto scan / IP camera / upload):
 *      image: photo file
 *      vehicleId?  (operator confirmed vehicle)
 *      direction?  ("in"|"out"|"auto"|omitted)
 *      plateText?  (manual correction — overrides OCR)
 */
export async function POST(req: Request) {
  const ctype = req.headers.get("content-type") || "";

  /* ─────────────────────────────────── JSON path (manual table button) */
  if (!ctype.includes("multipart/form-data")) {
    const body = await req.json().catch(() => ({}));
    const vehicleId = Number(body.vehicleId || 0);
    if (!vehicleId)
      return NextResponse.json({ error: "vehicleId required" }, { status: 400 });

    const [v] = await db.select().from(vehicles).where(eq(vehicles.id, vehicleId));
    if (!v)
      return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });

    const direction =
      body.direction === "in" || body.direction === "out"
        ? body.direction
        : v.parkStatus === "in"
        ? "out"
        : "in";

    try {
      const { event } = await gateScan({
        vehicleId,
        direction,
        media: body.plateText
          ? {
              photoUrl: body.photoUrl || "",
              plateText: body.plateText,
              confidence: body.confidence,
            }
          : undefined,
      });
      return NextResponse.json({ ok: true, event });
    } catch (e: any) {
      return NextResponse.json({ error: e?.message || "scan failed" }, { status: 409 });
    }
  }

  /* ──────────────────────────── multipart path (camera / upload / auto scan) */
  const form = await req.formData();
  const file = form.get("image");
  const manualVehicleId = Number(form.get("vehicleId") || 0);
  let plateText = String(form.get("plateText") || "").trim();
  const directionReq = String(form.get("direction") || "auto");

  if (!(file instanceof File))
    return NextResponse.json({ error: "No image in form data" }, { status: 400 });
  if (file.size > 12 * 1024 * 1024)
    return NextResponse.json({ error: "Image too large (max 12 MB)" }, { status: 400 });

  const input = Buffer.from(await file.arrayBuffer());

  // Resize for display and run OCR in parallel with fleet fetch
  const [photoBuf, fleet] = await Promise.all([
    sharp(input)
      .rotate()
      .resize({ width: 1200, withoutEnlargement: true })
      .jpeg({ quality: 64 })
      .toBuffer(),
    db.select().from(vehicles),
  ]);
  const photoUrl = `data:image/jpeg;base64,${photoBuf.toString("base64")}`;

  // Run OCR
  const ocr = await recognizePlate(input);
  if (!plateText) plateText = ocr.plate || "";

  // Rank ALL fleet vehicles by plate similarity
  const matches = fleet
    .map((v) => ({
      vehicleId: v.id,
      regNo: v.regNo,
      type: v.type,
      unit: v.unit,
      parkStatus: v.parkStatus,
      score: ocr.compact
        ? Math.round(scorePlate(ocr.compact, compactPlate(v.regNo)) * 100) / 100
        : 0,
    }))
    .sort((a, b) => b.score - a.score);

  const topMatch = matches[0];
  const secondMatch = matches[1];

  // Operator confirmed a specific vehicle explicitly
  let chosen = manualVehicleId
    ? matches.find((m) => m.vehicleId === manualVehicleId)
    : null;

  // Auto-select: top match must meet threshold AND be clearly better than
  // the second match (gap ≥ 0.10) to avoid ambiguous reads logging the
  // wrong vehicle when two similar plates are in fleet
  if (!chosen && !manualVehicleId) {
    const clearWinner =
      topMatch &&
      topMatch.score >= AUTO_LOG_SCORE_THRESHOLD &&
      (!secondMatch || topMatch.score - secondMatch.score >= 0.10);

    if (clearWinner) chosen = topMatch;
  }

  // Not confident enough — ask operator to confirm
  if (!chosen) {
    return NextResponse.json({
      ok: false,
      needConfirmation: true,
      detectedPlate: plateText || null,
      confidence: ocr.confidence,
      engine: ocr.engine,
      rawText: (ocr.rawText || "").slice(0, 300),
      // Return top 6 matches so operator can pick correct vehicle
      matches: matches.slice(0, 6),
      photoUrl,
    });
  }

  // Fetch full vehicle record for the chosen match
  const [vehicle] = await db
    .select()
    .from(vehicles)
    .where(eq(vehicles.id, chosen.vehicleId));

  const direction =
    directionReq === "in" || directionReq === "out"
      ? directionReq
      : vehicle!.parkStatus === "in"
      ? "out"
      : "in";

  try {
    const { event } = await gateScan({
      vehicleId: chosen.vehicleId,
      direction,
      media: {
        photoUrl,
        plateText: plateText || vehicle!.regNo,
        confidence: plateText
          ? ocr.confidence || chosen.score * 100
          : 99,
      },
    });

    return NextResponse.json({
      ok: true,
      scanned: true,
      regNo: vehicle!.regNo,
      direction,
      detectedPlate: plateText || vehicle!.regNo,
      confidence: event.confidence,
      engine: ocr.engine,
      matchScore: chosen.score,
      event,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "scan failed" },
      { status: 409 }
    );
  }
}
