import crypto from "crypto";
import { NextResponse } from "next/server";

export type Role = "officer" | "sentry" | "driver";
export type AuthUser = { id: number; role: Role };

export const COOKIE = "atc_token";
const MAX_AGE_DAYS = 30; // drivers log in once, so keep it long

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) throw new Error("SESSION_SECRET is not set on the server");
  return s;
}

/* ---------- passwords ---------- */
export function hashPassword(pw: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pw, salt, 64);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export const isHashed = (stored: string) => stored.startsWith("scrypt$");

export function verifyPassword(pw: string, stored: string): boolean {
  if (isHashed(stored)) {
    const [, saltHex, hashHex] = stored.split("$");
    const calc = crypto.scryptSync(pw, Buffer.from(saltHex, "hex"), 64);
    const expected = Buffer.from(hashHex, "hex");
    return expected.length === calc.length && crypto.timingSafeEqual(expected, calc);
  }
  // Legacy plain-text password (upgraded to a hash on first successful login)
  const a = Buffer.from(pw);
  const b = Buffer.from(stored);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/* ---------- login token (signed, cannot be forged or edited) ---------- */
const sign = (payload: string) =>
  crypto.createHmac("sha256", secret()).update(payload).digest("base64url");

export function signToken(u: AuthUser): string {
  const payload = Buffer.from(
    JSON.stringify({ id: u.id, role: u.role, exp: Date.now() + MAX_AGE_DAYS * 864e5 })
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function verifyToken(token: string): AuthUser | null {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const good = sign(payload);
  if (sig.length !== good.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good)))
    return null;
  try {
    const d = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (!d.exp || d.exp < Date.now()) return null;
    return { id: d.id, role: d.role };
  } catch {
    return null;
  }
}

/** Reads the login from the cookie (browser) or Authorization header (native app). */
export function getAuth(req: Request): AuthUser | null {
  const h = req.headers.get("authorization");
  let token = h?.startsWith("Bearer ") ? h.slice(7) : null;
  if (!token) {
    const m = (req.headers.get("cookie") || "").match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
    token = m ? m[1] : null;
  }
  return token ? verifyToken(token) : null;
}

/** Usage:  const a = requireRole(req, "officer");  if ("error" in a) return a.error; */
export function requireRole(
  req: Request,
  ...roles: Role[]
): { user: AuthUser } | { error: NextResponse } {
  const user = getAuth(req);
  if (!user) return { error: NextResponse.json({ error: "Not logged in" }, { status: 401 }) };
  if (roles.length && !roles.includes(user.role))
    return { error: NextResponse.json({ error: "Not allowed for your role" }, { status: 403 }) };
  return { user };
}
