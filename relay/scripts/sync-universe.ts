// Seeds/resyncs the `universe` table (dev brief section 9) from the relay's env config.
// Run again any time TOKENS/FW_FEEDS change, or after admin calls setUnderlying on-chain.
import { loadConfig, ETFS } from "../src/config.js";
import { connect } from "../src/db.js";

const cfg = loadConfig();
const db = connect(cfg.DATABASE_URL);

const tickers = new Set([...Object.keys(cfg.TOKENS), ...Object.keys(cfg.FW_FEEDS)]);
if (tickers.size === 0) {
  console.error("No tickers in TOKENS/FW_FEEDS. Nothing to seed.");
  process.exit(1);
}

let n = 0;
for (const ticker of tickers) {
  const token = cfg.TOKENS[ticker];
  const feed = cfg.FW_FEEDS[ticker];
  const isEtf = ETFS.has(ticker);
  await db.query(
    `INSERT INTO universe (ticker, token_address, chainlink_feed, is_etf, im_bps, active, paused)
     VALUES ($1,$2,$3,$4,$5,true,false)
     ON CONFLICT (ticker) DO UPDATE SET token_address = $2, chainlink_feed = $3, is_etf = $4, im_bps = $5`,
    [ticker, token ?? null, feed ?? null, isEtf, isEtf ? 1000 : 2000]
  );
  n++;
}
await db.end();
console.log(`Synced ${n} tickers into universe.`);
