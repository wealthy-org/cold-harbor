import { parseAbi, type Address, type Log } from "viem";
import type { Chain } from "./chain.js";
import type { Config } from "./config.js";
import type { Db } from "./db.js";

const spotEvents = parseAbi([
  "event QuoteFilled(bytes32 indexed rfqId, address indexed maker, address indexed taker, address makerToken, address takerToken, uint256 makerAmount, uint256 takerAmount, uint256 fee)",
]);
const fwEvents = parseAbi([
  "event ForwardOpened(uint256 indexed id, bytes32 indexed rfqId, address indexed maker, address taker, address stockToken, uint8 side, uint256 qty, uint256 strike, uint64 maturityCloseTs, uint256 makerMargin, uint256 takerMargin)",
  "event ForwardSettled(uint256 indexed id, uint256 closePrice, int256 pnlTaker)",
  "event ForwardLiquidated(uint256 indexed id, address indexed liquidatedParty, uint256 price, int256 pnlTaker, uint256 penalty)",
  "event ForwardClosed(uint256 indexed id, uint256 price, int256 pnlTaker)",
]);

// ponytail: reads only finalized-looking history (no reorg handling). Robinhood Chain is an L2 with a sequencer, so reorgs are rare;
// add a confirmation depth and a rewind on parent-hash mismatch before mainnet.
const MAX_SPAN = 2_000n;

export function startIndexer(cfg: Config, db: Db, chain: Chain) {
  const tickerOf = new Map(Object.entries(cfg.TOKENS).map(([t, a]) => [a.toLowerCase(), t]));
  const state = { head: 0n, spot: 0n, forward: 0n, error: null as string | null };
  let span = MAX_SPAN;
  let stopped = false;

  const blockTimes = new Map<bigint, Date>();
  async function timeOf(n: bigint): Promise<Date> {
    const hit = blockTimes.get(n);
    if (hit) return hit;
    const b = await chain.client.getBlock({ blockNumber: n });
    const d = new Date(Number(b.timestamp) * 1000);
    if (blockTimes.size > 500) blockTimes.clear();
    blockTimes.set(n, d);
    return d;
  }

  async function cursor(contract: string): Promise<bigint> {
    const r = await db.query(`SELECT last_block FROM indexer_state WHERE contract = $1`, [contract.toLowerCase()]);
    return r.rows[0] ? BigInt(r.rows[0].last_block) + 1n : BigInt(cfg.INDEX_FROM_BLOCK);
  }

  async function step(contract: Address, kind: "spot" | "forward", head: bigint) {
    const from = await cursor(contract);
    if (from > head) return;
    const to = from + span - 1n < head ? from + span - 1n : head;
    let logs: Log[];
    try {
      logs = (await chain.client.getLogs({ address: contract, events: kind === "spot" ? spotEvents : fwEvents, fromBlock: from, toBlock: to })) as Log[];
    } catch (e) {
      if (span > 100n) span = span / 2n; // RPC refused the range: shrink and retry next tick
      throw e;
    }
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      for (const l of logs) {
        const a = l as Log & { eventName: string; args: Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
        const at = await timeOf(l.blockNumber!);
        const tx = l.transactionHash!;
        const idx = l.logIndex!;
        if (a.eventName === "QuoteFilled") {
          const g = a.args;
          const stock = (tickerOf.has(String(g.makerToken).toLowerCase()) ? g.makerToken : g.takerToken) as string;
          await client.query(
            `INSERT INTO fills (tx_hash, log_index, product, rfq_id, maker, taker, ticker, maker_token, taker_token, maker_amount, taker_amount, fee, block_number, block_time)
             VALUES ($1,$2,'spot',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT DO NOTHING`,
            [tx, idx, g.rfqId, g.maker.toLowerCase(), g.taker.toLowerCase(), tickerOf.get(stock.toLowerCase()) ?? null, g.makerToken, g.takerToken, g.makerAmount.toString(), g.takerAmount.toString(), g.fee.toString(), l.blockNumber!.toString(), at]
          );
          await client.query(`UPDATE rfqs SET status = 'filled' WHERE rfq_id = $1`, [g.rfqId]);
          await client.query(
            `UPDATE quotes SET outcome = 'filled' WHERE rfq_id = $1 AND mm_id = (SELECT a.id FROM accounts a WHERE a.wallet = $2)`,
            [g.rfqId, g.maker.toLowerCase()]
          );
        } else if (a.eventName === "ForwardOpened") {
          const g = a.args;
          const tk = tickerOf.get(String(g.stockToken).toLowerCase()) ?? null;
          await client.query(
            `INSERT INTO forwards (id, rfq_id, maker, taker, ticker, stock_token, taker_side, qty, strike, maturity_close_ts, open_tx)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (id) DO NOTHING`,
            [g.id.toString(), g.rfqId, g.maker.toLowerCase(), g.taker.toLowerCase(), tk, g.stockToken, Number(g.side) === 0 ? "LONG" : "SHORT", g.qty.toString(), g.strike.toString(), g.maturityCloseTs.toString(), tx]
          );
          await client.query(
            `INSERT INTO fills (tx_hash, log_index, product, rfq_id, maker, taker, ticker, maker_token, maker_amount, forward_id, block_number, block_time)
             VALUES ($1,$2,'forward',$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT DO NOTHING`,
            [tx, idx, g.rfqId, g.maker.toLowerCase(), g.taker.toLowerCase(), tk, g.stockToken, g.qty.toString(), g.id.toString(), l.blockNumber!.toString(), at]
          );
          await client.query(`UPDATE rfqs SET status = 'filled' WHERE rfq_id = $1`, [g.rfqId]);
          await client.query(
            `UPDATE quotes SET outcome = 'filled' WHERE rfq_id = $1 AND mm_id = (SELECT a.id FROM accounts a WHERE a.wallet = $2)`,
            [g.rfqId, g.maker.toLowerCase()]
          );
        } else {
          const g = a.args;
          const status = a.eventName === "ForwardSettled" ? "settled" : a.eventName === "ForwardLiquidated" ? "liquidated" : "closed";
          const price = status === "settled" ? g.closePrice : g.price;
          await client.query(`UPDATE forwards SET status = $2, closed_tx = $3, close_price = $4 WHERE id = $1`, [g.id.toString(), status, tx, price.toString()]);
        }
      }
      await client.query(
        `INSERT INTO indexer_state (contract, last_block) VALUES ($1,$2) ON CONFLICT (contract) DO UPDATE SET last_block = EXCLUDED.last_block`,
        [contract.toLowerCase(), to.toString()]
      );
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      throw e;
    } finally {
      client.release();
    }
    state[kind] = to;
    if (span < MAX_SPAN) span = span * 2n > MAX_SPAN ? MAX_SPAN : span * 2n;
  }

  async function tick() {
    try {
      const head = await chain.client.getBlockNumber();
      state.head = head;
      // Catch up fully before sleeping, so a fresh start does not take minutes of 5 s ticks.
      for (let i = 0; i < 200 && !stopped; i++) {
        const before = [state.spot, state.forward];
        if (cfg.SETTLEMENT) await step(cfg.SETTLEMENT as Address, "spot", head);
        if (cfg.FW_ENGINE) await step(cfg.FW_ENGINE as Address, "forward", head);
        if (state.spot === before[0] && state.forward === before[1]) break;
      }
      state.error = null;
    } catch (e) {
      state.error = e instanceof Error ? e.message.slice(0, 160) : "indexer error";
      console.error("indexer:", state.error);
    }
  }

  void tick();
  const timer = setInterval(tick, 5_000);
  return {
    status: () => ({ head: Number(state.head), spot: Number(state.spot), forward: Number(state.forward), error: state.error }),
    stop: () => {
      stopped = true;
      clearInterval(timer);
    },
  };
}
