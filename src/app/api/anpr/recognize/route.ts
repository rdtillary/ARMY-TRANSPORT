import { NextResponse } from "next/server";
import { db } from "@/db";
import { vehicles } from "@/db/schema";
import { asc } from "drizzle-orm";
import sharp from "sharp";
import { recognizePlate, compactPlate, scorePlate } from "@/lib/anpr";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/anpr/recognize  (multipart/form-data)
 *   field "image": gate camera photograph (JPEG/PNG)
 * Returns the detected plate, confidence, ranked fleet matches and a
 * small data-URL thumbnail for display in the UI.
 */
export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("image");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No image uploaded (field name must be 'image')" }, { status: 400 });
    }
    if (file.size > 12 * 1024 * 1024) {
      return NextResponse.json({ error: "Image too large (max 12 MB)" }, { status: 400 });
    }

    const input = Buffer.from(await file.arrayBuffer());
    const [result, thumbBuf, fleet] = await Promise.all([
      recognizePlate(input),
      sharp(input)
        .rotate()
        .resize({ width: 1000, withoutEnlargement: true })
        .jpeg({ quality: 62 })
        .toBuffer(),
      db.select().from(vehicles).orderBy(asc(vehicles.regNo)),
    ]);

    const thumbDataUrl = `data:image/jpeg;base64,${thumbBuf.toString("base64")}`;

    let matches: { vehicleId: number; regNo: string; type: string; unit: string; score: number }[] = [];
    if (result.compact) {
      matches = fleet
        .map((v) => ({
          vehicleId: v.id,
          regNo: v.regNo,
          type: v.type,
          unit: v.unit,
          score: Math.round(scorePlate(result.compact!, compactPlate(v.regNo)) * 100) / 100,
        }))
        .filter((m) => m.score > 0.5)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);
    }

    return NextResponse.json({
      ok: true,
      plate: result.plate,
      confidence: result.confidence,
      engine: result.engine,
      rawText: result.rawText?.slice(0, 400) || "",
      matches,
      thumbDataUrl,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "ANPR failed" }, { status: 500 });
  }
}
