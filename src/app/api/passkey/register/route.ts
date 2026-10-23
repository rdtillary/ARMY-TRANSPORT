import { NextResponse } from "next/server";
import { db } from "@/db";
import { sql } from "drizzle-orm";
import {
  generateRegistrationOptions, verifyRegistrationResponse,
} from "@simplewebauthn/server";
import { currentUser } from "@/lib/passkey-session";
import {
  PASSKEY_ROLES, ensurePasskeyTables, saveChallenge, takeChallenge, b64, RP_ID, RP_NAME, ORIGIN,
} from "@/lib/passkeys";

export const dynamic = "force-dynamic";
const COOKIE = "pk_reg";

/** GET: start registering a passkey (admin must already be logged in). */
export async function GET(req: Request) {
  const user = await currentUser(req);
  if (!user || !PASSKEY_ROLES.includes(user.role))
    return NextResponse.json({ error: "Officer login required" }, { status: 401 });
  await ensurePasskeyTables();
  const existing: any = await db.execute(sql`select credential_id from passkeys where user_id = ${user.id}`);
  const options = await generateRegistrationOptions({
    rpName: RP_NAME, rpID: RP_ID,
    userName: user.name || `officer-${user.id}`,
    userID: new TextEncoder().encode(String(user.id)),
    attestationType: "none",
    excludeCredentials: (existing.rows || []).map((r: any) => ({ id: r.credential_id })),
    authenticatorSelection: { residentKey: "preferred", userVerification: "required" },
  });
  const cid = await saveChallenge(options.challenge, user.id);
  const res = NextResponse.json(options);
  res.cookies.set(COOKIE, cid, { httpOnly: true, secure: true, sameSite: "strict", path: "/api/passkey", maxAge: 300 });
  return res;
}

/** POST: finish registration. Body: { response, label? } */
export async function POST(req: Request) {
  const user = await currentUser(req);
  if (!user || !PASSKEY_ROLES.includes(user.role))
    return NextResponse.json({ error: "Officer login required" }, { status: 401 });
  await ensurePasskeyTables();
  const body = await req.json().catch(() => ({}));
  const cookie = (req.headers.get("cookie") || "").match(new RegExp(`${COOKIE}=([^;]+)`))?.[1];
  const ch = await takeChallenge(cookie);
  if (!ch || ch.user_id !== user.id)
    return NextResponse.json({ error: "Challenge expired, try again" }, { status: 400 });
  try {
    const v = await verifyRegistrationResponse({
      response: body.response, expectedChallenge: ch.challenge,
      expectedOrigin: ORIGIN, expectedRPID: RP_ID, requireUserVerification: true,
    });
    if (!v.verified || !v.registrationInfo)
      return NextResponse.json({ error: "Verification failed" }, { status: 400 });
    const c = v.registrationInfo.credential;
    await db.execute(sql`insert into passkeys (user_id, credential_id, public_key, counter, transports, label)
      values (${user.id}, ${c.id}, ${b64(c.publicKey)}, ${c.counter},
              ${JSON.stringify(c.transports || body.response?.response?.transports || [])},
              ${String(body.label || "Passkey").slice(0, 60)})`);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Registration failed" }, { status: 400 });
  }
}
