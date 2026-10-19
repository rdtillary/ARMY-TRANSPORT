import { pool } from "./index";

/**
 * Idempotent, additive schema fixes for databases created before a column was
 * added to src/db/schema.ts. Safe to run on every start.
 * (Without these, any `select` on a table fails with "column ... does not exist".)
 */
const STATEMENTS = [
  // Driver photo (added with the Drivers tab)
  `alter table users add column if not exists photo_url text`,
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
