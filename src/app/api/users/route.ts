import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq, asc } from "drizzle-orm";

const ROLES = ["officer", "jco", "driver"] as const;
type Role = (typeof ROLES)[number];

/** GET /api/users → all accounts (passwords are never returned). */
export async function GET() {
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      role: users.role,
      serviceNo: users.serviceNo,
      unit: users.unit,
    })
    .from(users)
    .orderBy(asc(users.role), asc(users.serviceNo));
  return NextResponse.json({ users: rows });
}

/**
 * POST /api/users
 *   single: {name, role, serviceNo, unit, password?}
 *   bulk:   {bulk: "role,serviceNo,name,unit\n..."}  (one person per line,
 *           password defaults to army123; lines starting with # are ignored)
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));

  if (typeof body.bulk === "string" && body.bulk.trim()) {
    const created: any[] = [];
    const errors: string[] = [];
    for (const raw of body.bulk.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const parts = line.split(/[,|]/).map((s: string) => s.trim());
      const [role, serviceNo, name, unit] = parts;
      const res = await createOne({
        role,
        serviceNo,
        name,
        unit: unit || "Unassigned",
        password: body.password,
      });
      if (res.error) errors.push(`${serviceNo || line}: ${res.error}`);
      else created.push(res.user);
    }
    return NextResponse.json({ ok: true, created, errors });
  }

  const res = await createOne(body);
  if (res.error) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json({ ok: true, user: res.user });
}

/** DELETE /api/users?id=.. */
export async function DELETE(req: Request) {
  const id = Number(new URL(req.url).searchParams.get("id") || 0);
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  try {
    await db.delete(users).where(eq(users.id, id));
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "This account has trip history and cannot be deleted — keep it, or reuse the service number." },
      { status: 409 }
    );
  }
}

async function createOne(b: any): Promise<any> {
  const name = String(b.name || "").trim();
  // "admin" is the display term for the officer/command role.
  const roleRaw = String(b.role || "").trim().toLowerCase();
  const role = (roleRaw === "admin" ? "officer" : roleRaw) as Role;
  const serviceNo = String(b.serviceNo || "").trim().toUpperCase();
  const unit = String(b.unit || "").trim() || "Unassigned";
  const password = String(b.password || "").trim() || "army123";

  if (!ROLES.includes(role)) return { error: "Role must be admin, jco or driver", status: 400 };
  if (!name) return { error: "Name is required", status: 400 };
  if (!serviceNo) return { error: "Service number is required", status: 400 };

  const existing = await db.select().from(users).where(eq(users.serviceNo, serviceNo));
  if (existing.length) return { error: `${serviceNo} already exists`, status: 409 };

  const [u] = await db
    .insert(users)
    .values({ name, role, serviceNo, unit, password })
    .returning({
      id: users.id,
      name: users.name,
      role: users.role,
      serviceNo: users.serviceNo,
      unit: users.unit,
    });
  return { user: u };
}
