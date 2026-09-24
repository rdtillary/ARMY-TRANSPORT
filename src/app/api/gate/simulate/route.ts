import { NextResponse } from "next/server";
import { db } from "@/db";
import { vehicles } from "@/db/schema";
import { asc } from "drizzle-orm";
import { gateScan } from "@/lib/ops";

export const dynamic = "force-dynamic";

/** POST /api/gate/simulate — camera catches a random vehicle crossing the gate. */
export async function POST() {
  const fleet = await db.select().from(vehicles).orderBy(asc(vehicles.id));
  const movable = fleet.filter((v) => v.status !== "maintenance");
  if (!movable.length) return NextResponse.json({ error: "No vehicles available" }, { status: 409 });

  // Bias toward sending parked vehicles OUT (the common demo scenario).
  const inside = movable.filter((v) => v.parkStatus === "in");
  const outside = movable.filter((v) => v.parkStatus === "out");
  let pick: (typeof movable)[number];
  if (inside.length && (outside.length === 0 || Math.random() < 0.6)) {
    pick = inside[Math.floor(Math.random() * inside.length)];
  } else if (outside.length) {
    pick = outside[Math.floor(Math.random() * outside.length)];
  } else {
    pick = movable[Math.floor(Math.random() * movable.length)];
  }
  const direction = pick.parkStatus === "in" ? "out" : "in";
  const { event } = await gateScan({ vehicleId: pick.id, direction });
  return NextResponse.json({ ok: true, event, regNo: pick.regNo, direction });
}
