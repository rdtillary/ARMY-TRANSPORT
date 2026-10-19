import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ensureSchema } from "@/db/migrate";
import { verifyPassword, hashPassword, isHashed, signToken, COOKIE, type Role } from "@/lib/auth";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const serviceNo = String(body.serviceNo || "").trim().toUpperCase();
  const password = String(body.password || "");
  const role = String(body.role || "");

  if (!serviceNo || !password) {
    return NextResponse.json({ error: "Enter service number and password" }, { status: 400 });
  }

  await ensureSchema();
  const rows = await db.select().from(users).where(eq(users.serviceNo, serviceNo));
  const u = rows.find((x) => verifyPassword(password, x.password));
  if (!u) return NextResponse.json({ error: "Invalid service number or password" }, { status: 401 });
  if (u.role !== role) {
    return NextResponse.json(
      { error: `This ID is registered as a ${u.role.toUpperCase()}, not ${role.toUpperCase()}` },
      { status: 401 }
    );
  }

  // Upgrade an old plain-text password to a hash
  if (!isHashed(u.password)) {
    await db.update(users).set({ password: hashPassword(password) }).where(eq(users.id, u.id));
  }

  const token = signToken({ id: u.id, role: u.role as Role });
  const res = NextResponse.json({
    id: u.id, name: u.name, role: u.role, unit: u.unit, serviceNo: u.serviceNo,
    token, // the Android shell needs this for background uploads (see below)
  });
  res.cookies.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 60 * 60,
  });
  return res;
}
