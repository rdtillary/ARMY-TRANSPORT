import crypto from "crypto";
import { db } from "@/db";
import { sql } from "drizzle-orm";

export const RP_ID = process.env.PASSKEY_RP_ID || "localhost";           // e.g. mt-park.onrender.com
export const ORIGIN = process.env.PASSKEY_ORIGIN || "http://localhost:3000"; // e.g. https://mt-park.onrender.com
// Roles allowed to use passkeys (your Role type: officer | sentry | driver).
export const PASSKEY_ROLES = ["officer"];
export const RP_NAME = "MT Park Admin";

let ready = false;
export async function ensurePasskeyTables() {
  if (ready) return;
  await db.execute(sql`create table if not exists passkeys (
    id serial primary key,
    user_id integer not null,
    credential_id text not null unique,
    public_key text not null,
    counter bigint not null default 0,
    transports text,
    label text,
    created_at timestamptz not null default now()
  )`);
  await db.execute(sql`create table if not exists passkey_challenges (
    id text primary key,
    challenge text not null,
    user_id integer,
    expires_at timestamptz not null
  )`);
  ready = true;
}

export async function saveChallenge(challenge: string, userId: number | null) {
  const id = crypto.randomBytes(16).toString("hex");
  await db.execute(sql`delete from passkey_challenges where expires_at < now()`);
  await db.execute(sql`insert into passkey_challenges (id, challenge, user_id, expires_at)
    values (${id}, ${challenge}, ${userId}, now() + interval '5 minutes')`);
  return id;
}

/** One-time use: returns and deletes. */
export async function takeChallenge(id: string | undefined) {
  if (!id) return null;
  const r: any = await db.execute(sql`delete from passkey_challenges
    where id = ${id} and expires_at > now() returning challenge, user_id`);
  return (r.rows?.[0] as { challenge: string; user_id: number | null }) ?? null;
}

export const b64 = (u: Uint8Array) => Buffer.from(u).toString("base64url");
export const unb64 = (s: string) => new Uint8Array(Buffer.from(s, "base64url"));
