import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const serviceNo = String(body.serviceNo || "").trim().toUpperCase();
  const password = String(body.password || "");
  const role = String(body.role || "");

  if (!serviceNo || !password) {
    return NextResponse.json({ error: "Enter service number and password" }, { status: 400 });
  }

  const rows = await db.select().from(users).where(eq(users.serviceNo, serviceNo));
  const u = rows.find((x) => x.password === password);
  if (!u) return NextResponse.json({ error: "Invalid service number or password" }, { status: 401 });
  if (u.role !== role) {
    return NextResponse.json(
      { error: `This ID is registered as a ${u.role.toUpperCase()}, not ${role.toUpperCase()}` },
      { status: 401 }
    );
  }

  return NextResponse.json({
    id: u.id,
    name: u.name,
    role: u.role,
    unit: u.unit,
    serviceNo: u.serviceNo,
  });
}
