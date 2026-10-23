// Bridge between passkeys and your existing auth.ts (already wired).
import { NextResponse } from "next/server";
import { getAuth, signToken, COOKIE, type AuthUser } from "@/lib/auth";

export type SessionUser = AuthUser & { name?: string };

/** Logged-in user from the atc_token cookie / Bearer header (or null). */
export async function currentUser(req: Request): Promise<SessionUser | null> {
  return getAuth(req);
}

/** Sets the SAME signed atc_token cookie your password login sets. */
export async function startSession(res: NextResponse, user: SessionUser) {
  const token = signToken({ id: user.id, role: user.role });
  res.cookies.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 60 * 60, // matches MAX_AGE_DAYS in auth.ts
  });
}
