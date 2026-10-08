import { NextResponse } from "next/server";
import { db } from "@/db";
import { vehicles } from "@/db/schema";
import { eq, asc, sql } from "drizzle-orm";

/** GET /api/vehicles */
export async function GET() {
  const rows = await db.select().from(vehicles).orderBy(asc(vehicles.cNo), asc(vehicles.regNo));
  return NextResponse.json({ vehicles: rows });
}

/**
 * POST /api/vehicles
 *   single: {cNo?, regNo, type, unit, fuelPct?, mileage?, maintenanceDue?, status?}
 *   bulk:   {bulk: "regNo,type,unit\n..."}  (# lines ignored)
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));

  if (typeof body.bulk === "string" && body.bulk.trim()) {
    const created: any[] = [];
    const errors: string[] = [];
    for (const raw of body.bulk.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const [regNo, type, unit] = line.split(/[,|]/).map((s: string) => s.trim());
      const res = await createOne({ regNo, type, unit: unit || "Unassigned" });
      if (res.error) errors.push(`${regNo || line}: ${res.error}`);
      else created.push(res.vehicle);
    }
    return NextResponse.json({ ok: true, created, errors });
  }

  const res = await createOne(body);
  if (res.error) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json({ ok: true, vehicle: res.vehicle });
}

/** DELETE /api/vehicles?id=.. */
export async function DELETE(req: Request) {
  const id = Number(new URL(req.url).searchParams.get("id") || 0);
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const [v] = await db.select().from(vehicles).where(eq(vehicles.id, id));
  if (v?.status === "active") {
    return NextResponse.json({ error: "Cannot delete a vehicle that is on an active trip" }, { status: 409 });
  }
  try {
    await db.delete(vehicles).where(eq(vehicles.id, id));
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "This vehicle has trip history and cannot be deleted." },
      { status: 409 }
    );
  }
}

async function createOne(b: any): Promise<any> {
  const regNo = String(b.regNo || "").trim().toUpperCase();
  const type = String(b.type || "").trim() || "Vehicle";
  const unit = String(b.unit || "").trim() || "Unassigned";
  const fuelPct = Math.max(0, Math.min(100, Number(b.fuelPct ?? 100) || 100));
  const mileage = Math.max(0, Number(b.mileage ?? 0) || 0);
  const maintenanceDue = b.maintenanceDue || null;
  const status = ["available", "maintenance"].includes(b.status) ? b.status : "available";
  const requestedCNo = Number(b.cNo ?? 0);

  if (!regNo) return { error: "Vehicle registration number is required", status: 400 };

  const existing = await db.select().from(vehicles).where(eq(vehicles.regNo, regNo));
  if (existing.length) return { error: `${regNo} already exists`, status: 409 };

  const nextCNo =
    Number.isFinite(requestedCNo) && requestedCNo > 0
      ? requestedCNo
      : await getNextVehicleNumber();

  const [v] = await db
    .insert(vehicles)
    .values({ cNo: nextCNo, regNo, type, unit, fuelPct, mileage, maintenanceDue, status })
    .returning();
  return { vehicle: v };
}

async function getNextVehicleNumber(): Promise<number> {
  const [row] = await db.select({ max: sql<number>`max(${vehicles.cNo})` }).from(vehicles);
  return (row?.max ?? 0) + 1;
}
