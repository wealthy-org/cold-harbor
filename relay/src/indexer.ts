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
  "event MarginToppedUp(uint256 indexed id, address indexed who, uint256 amount)",
  "event MarginCall(uint256 indexed id, address indexed who, uint256 equity, uint256 required, uint64 deadline)",
  "event MarginCallCleared(uint256 indexed id)",
]);
const oracleEvents = parseAbi([
  "event ObservationPinned(address indexed feed, uint64 indexed closeTs, uint256 price, bool usedBackup)",
]);
const calendarEvents = parseAbi([
  "event HolidaySet(uint256 indexed dayIndex, bool holiday)",
  "event EarlyCloseSet(uint256 indexed dayIndex, uint64 closeTs)",
]);

// ponytail: reads only finalized-looking history (no reorg handling). Robinhood Chain is an L2 with a sequencer, so reorgs are rare;
// add a confirmation depth and a rewind on parent-hash mismatch before mainnet.
const MAX_SPAN = 2_000n;

export function startIndexer(cfg: Config, db: Db, chain: Chain) {
  const tickerOf = new Map(Object.entries(cfg.TOKENS).map(([t, a]) => [a.toLowerCase(), t]));
  const state = { head: 0n, spot: 0n, forward: 0n, oracle: 0n, calendar: 0n, error: null as string | null };
  let span = MAX_SPAN;
  let stopped = false;
  let openFeeBps: bigint | null = null;
  let penaltyProtocolShareBps: bigint | null = null;

  const fwEngineAbi = parseAbi(["function openFeeBps() view returns (uint16)", "function penaltyProtocolShareBps() view returns (uint16)"]);
  async function fwParams() {
    if (openFeeBps !== null) return;
    try {
      const [a, b] = await Promise.all([
        chain.client.readContract({ address: cfg.FW_ENGINE as Address, abi: fwEngineAbi, functionName: "openFeeBps" }),
        chain.client.readContract({ address: cfg.FW_ENGINE as Address, abi: fwEngineAbi, functionName: "penaltyProtocolShareBps" }),
      ]);
      openFeeBps = BigInt(a);
      penaltyProtocolShareBps = BigInt(b);
    } catch {
      /* FW_ENGINE not configured or call failed; fee_ledger forward-open rows are skipped until it resolves */
    }
  }

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

  async function step(contract: Address, kind: "spot" | "forward" | "oracle" | "calendar", head: bigint) {
    const from = await cursor(contract);
    if (from > head) return;
    const to = from + span - 1n < head ? from + span - 1n : head;
    const events = kind === "spot" ? spotEvents : kind === "forward" ? fwEvents : kind === "oracle" ? oracleEvents : calendarEvents;
    let logs: Log[];
    try {
      logs = (await chain.client.getLogs({ address: contract, events, fromBlock: from, toBlock: to })) as Log[];
    } catch (e) {
      if (span > 100n) span = span / 2n; // RPC refused the range: shrink and retry next tick
      throw e;
    }
    if (kind === "forward" && logs.length > 0) await fwParams();
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
          if (g.fee > 0n) {
            await client.query(
              `INSERT INTO fee_ledger (source, ref_id, kind, amount_usdg, block_time) VALUES ('spot',$1,'fee',$2,$3)`,
              [g.rfqId, g.fee.toString(), at]
            );
          }
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
          if (openFeeBps) {
            const notional = (g.qty as bigint * (g.strike as bigint)) / 10n ** 18n;
            const fee = (notional * openFeeBps) / 10_000n;
            if (fee > 0n) {
              await client.query(
                `INSERT INTO fee_ledger (source, ref_id, kind, amount_usdg, block_time) VALUES ('forward',$1,'fee',$2,$3)`,
                [g.id.toString(), fee.toString(), at]
              );
            }
          }
        } else if (a.eventName === "MarginToppedUp") {
          const g = a.args;
          await client.query(
            `INSERT INTO margin_events (forward_id, type, who, amount, tx_hash, block_time) VALUES ($1,'topup',$2,$3,$4,$5)`,
            [g.id.toString(), g.who.toLowerCase(), g.amount.toString(), tx, at]
          );
        } else if (a.eventName === "MarginCall") {
          const g = a.args;
          await client.query(
            `INSERT INTO margin_events (forward_id, type, who, amount, tx_hash, block_time) VALUES ($1,'call',$2,$3,$4,$5)`,
            [g.id.toString(), g.who.toLowerCase(), g.required.toString(), tx, at]
          );
        } else if (a.eventName === "MarginCallCleared") {
          const g = a.args;
          await client.query(
            `INSERT INTO margin_events (forward_id, type, tx_hash, block_time) VALUES ($1,'call_cleared',$2,$3)`,
            [g.id.toString(), tx, at]
          );
        } else if (a.eventName === "ObservationPinned") {
          const g = a.args;
          await client.query(
            `INSERT INTO observations (feed, close_ts, price, source) VALUES ($1,$2,$3,$4) ON CONFLICT (feed, close_ts) DO NOTHING`,
            [String(g.feed).toLowerCase(), g.closeTs.toString(), g.price.toString(), g.usedBackup ? "pyth" : "chainlink"]
          );
        } else if (a.eventName === "HolidaySet") {
          const g = a.args;
          await client.query(
            `INSERT INTO calendar (day_index, is_holiday) VALUES ($1,$2)
             ON CONFLICT (day_index) DO UPDATE SET is_holiday = EXCLUDED.is_holiday`,
            [g.dayIndex.toString(), g.holiday]
          );
        } else if (a.eventName === "EarlyCloseSet") {
          const g = a.args;
          await client.query(
            `INSERT INTO calendar (day_index, early_close_ts) VALUES ($1,$2)
             ON CONFLICT (day_index) DO UPDATE SET early_close_ts = EXCLUDED.early_close_ts`,
            [g.dayIndex.toString(), g.closeTs.toString() === "0" ? null : g.closeTs.toString()]
          );
        } else {
          const g = a.args;
          const status = a.eventName === "ForwardSettled" ? "settled" : a.eventName === "ForwardLiquidated" ? "liquidated" : "closed";
          const price = status === "settled" ? g.closePrice : g.price;
          await client.query(`UPDATE forwards SET status = $2, closed_tx = $3, close_price = $4 WHERE id = $1`, [g.id.toString(), status, tx, price.toString()]);
          if (status === "liquidated") {
            await client.query(
              `INSERT INTO margin_events (forward_id, type, who, amount, price, tx_hash, block_time) VALUES ($1,'liquidation',$2,$3,$4,$5,$6)`,
              [g.id.toString(), (g.liquidatedParty as string).toLowerCase(), g.penalty.toString(), (g.price as bigint).toString(), tx, at]
            );
            if (penaltyProtocolShareBps) {
              const cut = ((g.penalty as bigint) * penaltyProtocolShareBps) / 10_000n;
              if (cut > 0n) {
                await client.query(
                  `INSERT INTO fee_ledger (source, ref_id, kind, amount_usdg, block_time) VALUES ('forward',$1,'liquidation_cut',$2,$3)`,
                  [g.id.toString(), cut.toString(), at]
                );
              }
            }
          }
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
        const before = [state.spot, state.forward, state.oracle, state.calendar];
        if (cfg.SETTLEMENT) await step(cfg.SETTLEMENT as Address, "spot", head);
        if (cfg.FW_ENGINE) await step(cfg.FW_ENGINE as Address, "forward", head);
        if (cfg.FW_ORACLE) await step(cfg.FW_ORACLE as Address, "oracle", head);
        if (cfg.FW_CALENDAR) await step(cfg.FW_CALENDAR as Address, "calendar", head);
        if (state.spot === before[0] && state.forward === before[1] && state.oracle === before[2] && state.calendar === before[3]) break;
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
    status: () => ({ head: Number(state.head), spot: Number(state.spot), forward: Number(state.forward), oracle: Number(state.oracle), calendar: Number(state.calendar), error: state.error }),
    stop: () => {
      stopped = true;
      clearInterval(timer);
    },
  };
}
