/** Runs once when the server starts, before requests are served. */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.DATABASE_URL) {
    const { ensureSchema } = await import("@/db/migrate");
    await ensureSchema();
  }
}
