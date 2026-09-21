import { NextResponse } from "next/server";
import { db } from "@/db";
import { vehicles } from "@/db/schema";
import { asc } from "drizzle-orm";

export async function GET() {
  const rows = await db.select().from(vehicles).orderBy(asc(vehicles.regNo));
  return NextResponse.json({ vehicles: rows });
}
