// TESTNET ONLY. Registers the 4 simulated makers (from contracts/.secrets/sim-makers.env) as MM accounts and writes
// their API keys to relay/.env.sim (gitignored). Run again to rotate the keys.
import { readFileSync, writeFileSync, chmodSync } from "node:fs";
import { privateKeyToAccount } from "viem/accounts";
import { newApiKey } from "../src/auth.js";
import { loadConfig } from "../src/config.js";
import { connect } from "../src/db.js";

const NAMES = ["Sim Maker A", "Sim Maker B", "Sim Maker C", "Sim Maker D"];
const cfg = loadConfig();
if (cfg.CHAIN_ID === 4663) throw new Error("refusing mainnet");
const env = Object.fromEntries(readFileSync("../contracts/.secrets/sim-makers.env", "utf8").split("\n").filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
const pks = (env.SIM_MAKER_PKS ?? "").split(",").filter(Boolean) as `0x${string}`[];
const db = connect(cfg.DATABASE_URL);
const keys: string[] = [];
for (const [i, pk] of pks.entries()) {
  const wallet = privateKeyToAccount(pk).address.toLowerCase();
  const k = newApiKey();
  const acc = await db.query(`INSERT INTO accounts (wallet, role) VALUES ($1,'mm') ON CONFLICT (wallet) DO UPDATE SET role = 'mm' RETURNING id`, [wallet]);
  await db.query(
    `INSERT INTO mm_profiles (account_id, name, api_key_hash, api_key_prefix, signer_addresses, status, simulated) VALUES ($1,$2,$3,$4,$5,'active',true)
     ON CONFLICT (account_id) DO UPDATE SET name = $2, api_key_hash = $3, api_key_prefix = $4, status = 'active', simulated = true`,
    [acc.rows[0].id, NAMES[i] ?? `Sim Maker ${i + 1}`, k.hash, k.prefix, [wallet]]
  );
  keys.push(k.key);
  console.log(`registered ${NAMES[i]} ${wallet} (key ${k.prefix}…)`);
}
await db.end();
writeFileSync(".env.sim", `SIM_MAKER_PKS=${pks.join(",")}\nSIM_API_KEYS=${keys.join(",")}\n`);
chmodSync(".env.sim", 0o600);
console.log("wrote relay/.env.sim");
