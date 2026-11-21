import { createHash, randomBytes } from "node:crypto";
import type { Db } from "./db.js";

export type Mm = { id: number; name: string; wallet: string; simulated: boolean };

export const hashKey = (key: string) => createHash("sha256").update(key).digest("hex");

/** Keys are shown once. Only the hash is stored. */
export function newApiKey() {
  const key = "chk_" + randomBytes(32).toString("base64url");
  return { key, hash: hashKey(key), prefix: key.slice(0, 8) };
}

export async function mmByKey(db: Db, key: string): Promise<Mm | null> {
  if (!/^chk_[A-Za-z0-9_-]{20,80}$/.test(key)) return null;
  const r = await db.query(
    `SELECT p.account_id AS id, p.name, a.wallet, p.simulated
       FROM mm_profiles p JOIN accounts a ON a.id = p.account_id
      WHERE p.api_key_hash = $1 AND p.status = 'active'`,
    [hashKey(key)]
  );
  const row = r.rows[0];
  return row ? { id: Number(row.id), name: row.name, wallet: row.wallet, simulated: row.simulated } : null;
}
