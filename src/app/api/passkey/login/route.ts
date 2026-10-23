import { NextResponse } from "next/server";
import { db } from "@/db";
import { sql } from "drizzle-orm";
import {
  generateAuthenticationOptions, verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import { startSession } from "@/lib/passkey-session";
import {
  PASSKEY_ROLES, ensurePasskeyTables, saveChallenge, takeChallenge, unb64, RP_ID, ORIGIN,
} from "@/lib/passkeys";

export const dynamic = "force-dynamic";
const COOKIE = "pk_login";

/** GET: start login. Uses discoverable credentials, so no username needed. */
export async function GET() {
  await ensurePasskeyTables();
  const options = await generateAuthenticationOptions({ rpID: RP_ID, userVerification: "required" });
  const cid = await saveChallenge(options.challenge, null);
  const res = NextResponse.json(options);
  res.cookies.set(COOKIE, cid, { httpOnly: true, secure: true, sameSite: "strict", path: "/api/passkey", maxAge: 300 });
  return res;
}

/** POST: finish login. Body: { response } */
export async function POST(req: Request) {
  await ensurePasskeyTables();
  const body = await req.json().catch(() => ({}));
  const cookie = (req.headers.get("cookie") || "").match(new RegExp(`${COOKIE}=([^;]+)`))?.[1];
  const ch = await takeChallenge(cookie);
  const fail = () => NextResponse.json({ error: "Passkey login failed" }, { status: 401 });
  if (!ch || !body.response?.id) return fail();

  const r: any = await db.execute(sql`
    select p.id, p.user_id, p.public_key, p.counter, u.role, u.name
    from passkeys p join users u on u.id = p.user_id
    where p.credential_id = ${body.response.id} limit 1`);
  const row = r.rows?.[0];
  if (!row || !PASSKEY_ROLES.includes(row.role)) return fail();

  try {
    const v = await verifyAuthenticationResponse({
      response: body.response, expectedChallenge: ch.challenge,
      expectedOrigin: ORIGIN, expectedRPID: RP_ID, requireUserVerification: true,
      credential: { id: body.response.id, publicKey: unb64(row.public_key), counter: Number(row.counter) },
    });
    if (!v.verified) return fail();
    await db.execute(sql`update passkeys set counter = ${v.authenticationInfo.newCounter} where id = ${row.id}`);
    const res = NextResponse.json({ ok: true });
    await startSession(res, { id: row.user_id, role: row.role, name: row.name });
    return res;
  } catch {
    return fail();
  }
}
