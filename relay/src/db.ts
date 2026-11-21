import pg from "pg";

export type Db = pg.Pool;

/** One pool for the whole process. Neon closes idle connections, so keep the pool small and let it reconnect. */
export function connect(url: string): Db {
  const pool = new pg.Pool({ connectionString: url, max: 8, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 10_000, ssl: url.includes("localhost") ? undefined : { rejectUnauthorized: true } });
  pool.on("error", (e) => console.error("postgres pool error:", e.message));
  return pool;
}
