import { pool } from "./index";

/**
 * Idempotent, additive schema fixes for databases created before a column was
 * added to src/db/schema.ts. Safe to run on every start.
 * (Without these, any `select` on a table fails with "column ... does not exist".)
 */
const STATEMENTS = [
  // Driver photo (added with the Drivers tab)
  `alter table users add column if not exists photo_url text`,

  // JCO terminal was replaced by Sentry: move any old JCO accounts over
  `update users set role = 'sentry' where role = 'jco'`,

  // Sentry under-vehicle scans
  `create table if not exists sentry_scans (
     id serial primary key,
     label text not null,
     uploaded_by text not null,
     video_mime text not null,
     video_size integer not null,
     video_data bytea not null,
     stitched_url text not null,
     frames integer not null default 0,
     duration_sec double precision not null default 0,
     ts timestamp not null default now()
   )`,

  // Auto-scan captures are stored even when no fleet vehicle is matched
  `alter table gate_events alter column vehicle_id drop not null`,

  // Built-in admin account for the control room terminal.
  // Keeps the documented default login working even on a fresh database.
  `insert into users (name, role, service_no, unit, password)
   select 'Central Control Room Admin', 'officer', 'admin', 'Central Control Room', 'admin'
   where not exists (select 1 from users where service_no = 'admin')`,
];

let done: Promise<void> | null = null;

export function ensureSchema(): Promise<void> {
  if (!done) {
    done = (async () => {
      for (const sql of STATEMENTS) {
        await pool.query(sql);
      }
    })().catch((e) => {
      done = null; // retry on the next call
      console.error("[migrate] schema check failed:", e instanceof Error ? e.message : e);
    });
  }
  return done;
}
