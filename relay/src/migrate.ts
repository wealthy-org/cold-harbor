import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "./config.js";
import { connect } from "./db.js";

// Applies migrations/*.sql in filename order, each inside a transaction, once. Safe to run on every deploy.
async function main() {
  const cfg = loadConfig();
  const db = connect(cfg.DATABASE_URL);
  const dir = join(import.meta.dirname, "..", "migrations");
  const client = await db.connect();
  try {
    await client.query("CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())");
    await client.query("SELECT pg_advisory_lock(7140001)"); // two deploys at once must not race
    const done = new Set((await client.query("SELECT name FROM schema_migrations")).rows.map((r) => r.name as string));
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) {
      if (done.has(f)) continue;
      await client.query("BEGIN");
      try {
        await client.query(readFileSync(join(dir, f), "utf8"));
        await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [f]);
        await client.query("COMMIT");
        console.log("applied", f);
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      }
    }
    console.log("migrations up to date");
  } finally {
    client.release();
    await db.end();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
