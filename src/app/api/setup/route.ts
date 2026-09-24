import { NextResponse } from "next/server";
import { pool } from "@/db";

export const dynamic = "force-dynamic";

/**
 * One-time database setup — for deploying to a fresh cloud database.
 * Visit  https://YOUR-APP-URL/api/setup  once after deploying; it creates
 * every table (if missing) and seeds the demo accounts + vehicles.
 * Idempotent — safe to call again, it never overwrites existing data.
 *
 * NOTE: once your production database is set up, you may delete this route
 * and redeploy so the endpoint no longer exists.
 */

const DDL = [
  `create table if not exists users (
    id serial primary key,
    name text not null,
    role text not null,
    service_no text not null unique,
    unit text not null,
    password text not null
  )`,
  `create table if not exists vehicles (
    id serial primary key,
    reg_no text not null unique,
    type text not null,
    unit text not null,
    fuel_pct integer not null default 80,
    mileage integer not null default 0,
    maintenance_due date,
    status text not null default 'available'
  )`,
  `create table if not exists trips (
    id serial primary key,
    driver_id integer not null references users(id),
    vehicle_id integer not null references vehicles(id),
    started_at timestamptz not null default now(),
    ended_at timestamptz,
    status text not null default 'active'
  )`,
  `create table if not exists positions (
    id serial primary key,
    trip_id integer not null references trips(id),
    vehicle_id integer not null references vehicles(id),
    lat double precision not null,
    lng double precision not null,
    speed double precision,
    heading double precision,
    accuracy double precision,
    ts timestamptz not null default now()
  )`,
  `create table if not exists checkpoints (
    id serial primary key,
    trip_id integer not null references trips(id),
    lat double precision,
    lng double precision,
    note text,
    ts timestamptz not null default now()
  )`,
  `create table if not exists alerts (
    id serial primary key,
    kind text not null,
    message text not null,
    trip_id integer references trips(id),
    vehicle_id integer references vehicles(id),
    driver_id integer references users(id),
    ts timestamptz not null default now(),
    resolved boolean not null default false
  )`,
  `create table if not exists broadcasts (
    id serial primary key,
    from_name text not null,
    "to" text not null,
    message text not null,
    ts timestamptz not null default now()
  )`,
  // --- MT Park operations ---
  `alter table vehicles add column if not exists park_status text not null default 'in'`,
  `alter table vehicles add column if not exists pending_stop_at timestamptz`,
  `create table if not exists gate_events (
    id serial primary key,
    vehicle_id integer not null references vehicles(id),
    direction text not null,
    photo_url text not null,
    plate_text text not null,
    confidence double precision not null default 98,
    driver_id integer references users(id),
    ts timestamptz not null default now()
  )`,
  `create table if not exists notifications (
    id serial primary key,
    target text not null,
    title text not null,
    message text not null,
    kind text not null default 'info',
    vehicle_id integer,
    trip_id integer,
    ts timestamptz not null default now(),
    read boolean not null default false
  )`,
  `create table if not exists incidents (
    id serial primary key,
    kind text not null,
    message text not null,
    vehicle_id integer not null references vehicles(id),
    trip_id integer,
    driver_id integer references users(id),
    ts timestamptz not null default now(),
    last_repeat_at timestamptz,
    resolved boolean not null default false,
    resolved_at timestamptz
  )`,
];

// One-time migration: the only built-in account is the central control room
// administrator (id "ADMIN", password "admin"). All other accounts are created
// from the Admin terminal's Personnel & Fleet Administration panel.
const DEMO_SERVICE_NOS = ["OFC-1001", "JCO-2002", "DRV-3003", "DRV-3004"];

const SEED = [
  `insert into users (name, role, service_no, unit, password) values
    ('Control Room Admin', 'officer', 'ADMIN', 'Central Control Room', 'admin')
   on conflict (service_no) do update
    set password = excluded.password, role = 'officer', unit = 'Central Control Room'`,
  `insert into vehicles (reg_no, type, unit, fuel_pct, mileage, maintenance_due, status) values
    ('0012 AB 3456', 'Scout Car (Mahindra)', '7th Armoured',    82, 12450, '2026-03-15', 'available'),
    ('0045 KJ 2231', 'Truck 5T (Tata)',      '7th Armoured',    67, 48210, '2026-02-28', 'available'),
    ('0912 PL 7788', 'Armoured Carrier',     '12th Mechanised', 91, 22100, '2026-04-10', 'available'),
    ('0301 GH 4567', 'Ambulance (Force)',    '3rd Cavalry',     55, 30980, '2026-02-20', 'available'),
    ('0672 LM 8901', 'Fuel Tanker',          '7th Armoured',    74, 61020, '2026-03-05', 'available'),
    ('0128 ZQ 3344', 'Comms Vehicle',        'Signal Corps',    88, 15600, '2026-05-01', 'maintenance')
   on conflict (reg_no) do nothing`,
];

export async function GET() {
  try {
    for (const stmt of DDL) await pool.query(stmt);

    // One-time removal of old demo accounts (only runs until ADMIN exists).
    // Constants are a fixed allow-list, so inline literals are safe here.
    const adminCheck = await pool.query(`select 1 from users where service_no = 'ADMIN' limit 1`);
    if (adminCheck.rowCount === 0) {
      const inList = DEMO_SERVICE_NOS.map((s) => `'${s.replace(/'/g, "''")}'`).join(",");
      await pool.query(
        `delete from positions where trip_id in (
           select t.id from trips t join users u on t.driver_id = u.id
           where u.service_no in (${inList}));
         delete from checkpoints where trip_id in (
           select t.id from trips t join users u on t.driver_id = u.id
           where u.service_no in (${inList}));
         delete from alerts
           where driver_id in (select id from users where service_no in (${inList}))
              or trip_id in (
                select t.id from trips t join users u on t.driver_id = u.id
                where u.service_no in (${inList}));
         delete from trips where driver_id in
           (select id from users where service_no in (${inList}));
         delete from users where service_no in (${inList});
         update vehicles set status = 'available';`
      );
    }

    for (const stmt of SEED) await pool.query(stmt);

    const u = await pool.query(`select count(*)::int as c from users`);
    const v = await pool.query(`select count(*)::int as c from vehicles`);
    const t = await pool.query(`select count(*)::int as c from trips`);

    return NextResponse.json({
      ok: true,
      message: "Database setup complete",
      users: u.rows[0]?.c,
      vehicles: v.rows[0]?.c,
      tripsSoFar: t.rows[0]?.c,
      note: "Open the app root URL to log in. For production, delete /api/setup from the code and redeploy.",
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Setup failed — check that DATABASE_URL points to a reachable PostgreSQL database." },
      { status: 500 }
    );
  }
}
