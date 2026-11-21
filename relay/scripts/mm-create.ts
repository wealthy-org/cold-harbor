// Creates (or re-keys) a market maker account. The API key is printed ONCE and only its hash is stored.
// Usage: pnpm mm:create --name "Alpha Liquidity" --wallet 0x...
import { newApiKey } from "../src/auth.js";
import { loadConfig } from "../src/config.js";
import { connect } from "../src/db.js";

const arg = (n: string) => process.argv[process.argv.indexOf(`--${n}`) + 1];
const name = arg("name");
const wallet = arg("wallet")?.toLowerCase();
if (!name || !wallet || !/^0x[0-9a-f]{40}$/.test(wallet)) {
  console.error('Usage: pnpm mm:create --name "Name" --wallet 0xMakerWallet');
  process.exit(1);
}
const cfg = loadConfig();
const db = connect(cfg.DATABASE_URL);
const k = newApiKey();
const acc = await db.query(`INSERT INTO accounts (wallet, role) VALUES ($1,'mm') ON CONFLICT (wallet) DO UPDATE SET role = 'mm' RETURNING id`, [wallet]);
await db.query(
  `INSERT INTO mm_profiles (account_id, name, api_key_hash, api_key_prefix, signer_addresses, status) VALUES ($1,$2,$3,$4,$5,'active')
   ON CONFLICT (account_id) DO UPDATE SET name = $2, api_key_hash = $3, api_key_prefix = $4, status = 'active'`,
  [acc.rows[0].id, name, k.hash, k.prefix, [wallet]]
);
await db.end();
console.log(`Maker "${name}" ready for ${wallet}.\nAPI key (shown once, store it now):\n${k.key}`);
