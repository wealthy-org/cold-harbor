import { randomBytes } from "node:crypto";
import type { WebSocket } from "ws";
import type { Address, Hex } from "viem";
import type { Mm } from "./auth.js";
import type { Chain } from "./chain.js";
import { ETFS, type Config } from "./config.js";
import type { Db } from "./db.js";
import { fetchPrices, type RefPrice } from "./prices.js";
import { BASE_DECIMALS, USDG_DECIMALS, clientMessage, forwardQuote, spotQuote, type ForwardQuote, type RfqInput, type SpotQuote } from "./protocol.js";
import { validateForward, validateSpot, type Ctx, type ForwardRfq, type SpotRfq, type Verdict } from "./validate.js";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

type Conn = { mm: Mm; ws: WebSocket; msgTimes: number[] };
type Entry = { mm: Mm; quote: SpotQuote | ForwardQuote; signature: Hex; receivedMs: number; verdict: Verdict };
type Active = {
  id: string;
  product: "spot" | "forward";
  startedMs: number;
  closed: boolean;
  submitted: Set<number>;
  pending: Promise<void>[];
  entries: Entry[];
  expected: number; // makers that received the request
  inflight: number; // validations still running
  wake?: () => void; // ends the wait early once every maker has answered
  spot?: SpotRfq;
  fwd?: ForwardRfq;
};

export type RankedQuote = { id: string; makerName: string; quote: SpotQuote | ForwardQuote; signature: Hex; latencyMs: number; simulated: boolean };
export type RfqResult = {
  rfqId: string;
  issuedAt: number;
  product: "spot" | "forward";
  side: string;
  ref: { mid: number; bid: number; ask: number; generatedAt: string };
  executable: boolean;
  simulated: boolean;
  rejected: number;
  quotes: RankedQuote[];
};

const MAX_MSGS_PER_SEC = 20;
const MAX_ACTIVE_RFQS = 200;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class Hub {
  private conns = new Map<number, Conn>();
  private active = new Map<string, Active>();
  readonly ctx: Ctx;

  constructor(private cfg: Config, private db: Db, private chain: Chain) {
    this.ctx = { cfg, chain, nowS: () => Math.floor(Date.now() / 1000) };
  }

  get connectedMakers() {
    return this.conns.size;
  }
  isConnected(mmId: number) {
    return this.conns.has(mmId);
  }
  disconnect(mmId: number, reason: string) {
    this.conns.get(mmId)?.ws.close(4001, reason);
  }

  /** Per-maker caps from the portal. No row for a ticker or "*" means the relay adds no cap (the maker's balance and margin still apply). 0 open forwards means unlimited. */
  private async limitProblem(mmId: number, wallet: string, ticker: string, product: string, notional: bigint): Promise<string | null> {
    const r = await this.db.query(`SELECT ticker, max_notional, max_open_forwards FROM mm_limits WHERE mm_id = $1 AND ticker IN ($2, '*')`, [mmId, ticker]);
    const row = r.rows.find((x) => x.ticker === ticker) ?? r.rows[0];
    if (!row) return null;
    if (notional > BigInt(row.max_notional)) return `above your max notional for ${row.ticker} (${row.max_notional} USDG units)`;
    if (product === "forward" && row.max_open_forwards > 0) {
      const c = await this.db.query(`SELECT count(*)::int AS n FROM forwards WHERE maker = $1 AND status = 'open'`, [wallet]);
      if (c.rows[0].n >= row.max_open_forwards) return `you already have ${c.rows[0].n} open forwards, your limit is ${row.max_open_forwards}`;
    }
    return null;
  }

  // ---------------------------------------------------------------- sockets

  register(mm: Mm, ws: WebSocket) {
    const old = this.conns.get(mm.id);
    if (old) old.ws.close(4000, "replaced by a newer connection");
    const conn: Conn = { mm, ws, msgTimes: [] };
    this.conns.set(mm.id, conn);
    ws.on("message", (raw) => void this.onMessage(conn, raw.toString()));
    ws.on("close", () => {
      if (this.conns.get(mm.id) === conn) this.conns.delete(mm.id);
    });
    ws.on("error", () => ws.terminate());
    this.send(conn, { type: "hello", maker: mm.wallet, name: mm.name, chainId: this.cfg.CHAIN_ID, quoteDeadlineMs: this.cfg.QUOTE_DEADLINE_MS, minExpirySec: this.cfg.MIN_EXPIRY_SEC, maxExpirySec: this.cfg.MAX_EXPIRY_SEC });
  }

  private send(conn: Conn, msg: unknown) {
    if (conn.ws.readyState === conn.ws.OPEN) conn.ws.send(JSON.stringify(msg));
  }

  private async onMessage(conn: Conn, raw: string) {
    const now = Date.now();
    conn.msgTimes = conn.msgTimes.filter((t) => now - t < 1000);
    conn.msgTimes.push(now);
    if (conn.msgTimes.length > MAX_MSGS_PER_SEC) return void conn.ws.close(1008, "rate limit exceeded");

    let msg;
    try {
      const parsed = clientMessage.safeParse(JSON.parse(raw));
      if (!parsed.success) return this.send(conn, { type: "error", reason: "invalid message: " + parsed.error.issues[0]?.message });
      msg = parsed.data;
    } catch {
      return this.send(conn, { type: "error", reason: "message is not valid JSON" });
    }
    if (msg.type === "ping") return this.send(conn, { type: "pong" });

    const rfq = this.active.get(msg.rfqId.toLowerCase());
    const reject = (reason: string) => this.send(conn, { type: "quote.ack", rfqId: msg.rfqId, status: "rejected", reason });
    if (!rfq || rfq.closed) return reject("RFQ is closed or unknown");
    const elapsed = now - rfq.startedMs;
    if (elapsed > this.cfg.QUOTE_DEADLINE_MS) return reject(`late: deadline is ${this.cfg.QUOTE_DEADLINE_MS} ms`);
    if (rfq.submitted.has(conn.mm.id)) return reject("only one quote per RFQ per maker");
    rfq.submitted.add(conn.mm.id);

    const parsedQuote = (rfq.product === "spot" ? spotQuote : forwardQuote).safeParse(msg.quote);
    if (!parsedQuote.success) {
      reject("quote fields invalid: " + parsedQuote.error.issues[0]?.path.join(".") + " " + parsedQuote.error.issues[0]?.message);
      if (rfq.submitted.size >= rfq.expected && rfq.inflight === 0) rfq.wake?.();
      return;
    }

    rfq.inflight++;
    const task = (async () => {
      let verdict: Verdict;
      try {
        verdict =
          rfq.product === "spot"
            ? await validateSpot(this.ctx, rfq.spot!, conn.mm.wallet, parsedQuote.data as SpotQuote, msg.signature as Hex)
            : await validateForward(this.ctx, rfq.fwd!, conn.mm.wallet, parsedQuote.data as ForwardQuote, msg.signature as Hex);
      } catch (e) {
        verdict = { ok: false, reason: "could not verify against the chain: " + (e instanceof Error ? e.message.split("\n")[0] : "error") };
      }
      if (verdict.ok) {
        const q = parsedQuote.data as unknown as Record<string, string>;
        const notional = rfq.product === "spot" ? BigInt(rfq.spot!.side === "BUY" ? q.takerAmount! : q.makerAmount!) : (BigInt(q.qty!) * BigInt(q.strike!)) / 10n ** 20n;
        const why = await this.limitProblem(conn.mm.id, conn.mm.wallet, rfq.product === "spot" ? rfq.spot!.ticker : rfq.fwd!.ticker, rfq.product, notional).catch(() => null);
        if (why) verdict = { ok: false, reason: why };
      }
      rfq.entries.push({ mm: conn.mm, quote: parsedQuote.data, signature: msg.signature as Hex, receivedMs: elapsed, verdict });
      this.send(conn, verdict.ok ? { type: "quote.ack", rfqId: msg.rfqId, status: "accepted" } : { type: "quote.ack", rfqId: msg.rfqId, status: "rejected", reason: verdict.reason });
      rfq.inflight--;
      if (rfq.submitted.size >= rfq.expected && rfq.inflight === 0) rfq.wake?.();
    })();
    rfq.pending.push(task);
  }

  // ---------------------------------------------------------------- RFQ

  async runRfq(input: RfqInput): Promise<RfqResult> {
    const cfg = this.cfg;
    if (this.active.size >= MAX_ACTIVE_RFQS) throw new HttpError(503, "Too many RFQs in flight. Try again shortly.");
    const ticker = input.ticker.toUpperCase();
    const token = cfg.TOKENS[ticker];
    if (!token) throw new HttpError(404, `${ticker} is not available on this network.`);

    let ref: RefPrice | undefined;
    try {
      ref = (await fetchPrices())[ticker];
    } catch {
      throw new HttpError(502, "Reference price feed is unavailable.");
    }
    if (!ref) throw new HttpError(404, `No reference price for ${ticker}.`);
    if (ref.stopped) throw new HttpError(409, `${ticker} trading is stopped.`);

    const id = ("0x" + randomBytes(32).toString("hex")) as Hex;
    const startedMs = Date.now();
    const act: Active = { id, product: input.product, startedMs, closed: false, submitted: new Set(), pending: [], entries: [], expected: 0, inflight: 0 };
    let request: Record<string, unknown>;
    let params: Record<string, unknown> = {};
    let amount: bigint;
    const oracleRef = { source: "robinhood-api", price: Math.round(ref.mid * 1e8).toString(), updatedAt: Math.floor(Date.parse(ref.generatedAt || new Date().toISOString()) / 1000) };
    const common = { type: "rfq.request", rfqId: id, product: input.product, chainId: cfg.CHAIN_ID, taker: input.taker, oracleRef, quoteDeadlineMs: cfg.QUOTE_DEADLINE_MS, minExpirySec: cfg.MIN_EXPIRY_SEC };

    if (input.product === "spot") {
      if (!cfg.SETTLEMENT || !cfg.USDG) throw new HttpError(503, "Spot trading is not configured.");
      amount = BigInt(input.baseAmount);
      if (amount <= 0n) throw new HttpError(400, "Amount must be greater than zero.");
      if (amount > 10_000_000n * 10n ** BigInt(BASE_DECIMALS)) throw new HttpError(400, "Amount is above the maximum size.");
      const [paused, allowed, fee] = await Promise.all([this.chain.spotPaused(), this.chain.tokenAllowed(token as Address), this.chain.spotFeeBps()]).catch(() => {
        throw new HttpError(502, "Could not read the settlement contract.");
      });
      if (paused) throw new HttpError(503, "Settlement is paused.");
      if (!allowed) throw new HttpError(409, `${ticker} is not enabled on the settlement contract.`);
      act.spot = { id, taker: input.taker, ticker, side: input.side, token: token as Address, base: amount, ref };
      request = { ...common, domain: { name: "Cold Harbor", version: "1", chainId: cfg.CHAIN_ID, verifyingContract: cfg.SETTLEMENT }, baseToken: { symbol: ticker, address: token, decimals: BASE_DECIMALS }, quoteToken: { symbol: "USDG", address: cfg.USDG, decimals: USDG_DECIMALS }, side: input.side, baseAmount: input.baseAmount, feeBps: fee };
    } else {
      const feed = cfg.FW_FEEDS[ticker];
      if (!cfg.FW_ENGINE || !feed) throw new HttpError(503, `Forwards are not available for ${ticker}.`);
      amount = BigInt(input.qty);
      if (amount <= 0n) throw new HttpError(400, "Quantity must be greater than zero.");
      const nowS = Math.floor(Date.now() / 1000);
      const [limits, fee, official] = await Promise.all([this.chain.fwLimits(), this.chain.fwFeeBps(), this.chain.isOfficialClose(input.maturityCloseTs)]).catch(() => {
        throw new HttpError(502, "Could not read the forward contracts.");
      });
      if (limits.paused) throw new HttpError(503, "Forwards are paused.");
      if (input.maturityCloseTs < nowS + limits.minTenor || input.maturityCloseTs > nowS + limits.maxTenor) throw new HttpError(400, "Maturity is outside the allowed tenor.");
      if (!official) throw new HttpError(400, "That date is not an official market close.");
      const im = ETFS.has(ticker) ? 1000 : 2000;
      act.fwd = { id, taker: input.taker, ticker, side: input.side, token: token as Address, qty: amount, maturityCloseTs: input.maturityCloseTs, ref };
      params = { maturityCloseTs: input.maturityCloseTs };
      request = { ...common, domain: { name: "Cold Harbor Forwards", version: "1", chainId: cfg.CHAIN_ID, verifyingContract: cfg.FW_ENGINE }, underlying: ticker, stockToken: token, feed, side: input.side, qty: input.qty, maturityCloseTs: input.maturityCloseTs, imBps: im, mmBps: im / 2, feeBps: fee };
    }

    // Insert and broadcast run together: makers should not wait for Neon. The insert is awaited before anything is stored against it.
    const inserted = this.db.query(
      `INSERT INTO rfqs (rfq_id, taker, product, ticker, side, amount, params, expires_at) VALUES ($1,$2,$3,$4,$5,$6,$7, now() + ($8 || ' milliseconds')::interval)`,
      [id, input.taker.toLowerCase(), input.product, ticker, input.side, amount.toString(), JSON.stringify(params), String(cfg.QUOTE_DEADLINE_MS + 60_000)]
    );
    inserted.catch(() => {});

    act.startedMs = Date.now(); // the deadline runs from the broadcast, not from RFQ creation
    act.expected = this.conns.size;
    this.active.set(id, act);
    for (const c of this.conns.values()) this.send(c, request);
    // Wait for the deadline, or finish early once every maker that got the request has answered and been checked.
    await Promise.race([sleep(cfg.QUOTE_DEADLINE_MS), new Promise<void>((r) => (act.wake = r))]);
    act.closed = true;
    await Promise.race([Promise.allSettled(act.pending), sleep(4_000)]);
    this.active.delete(id);
    try {
      await inserted;
    } catch (e) {
      console.error("rfq insert failed:", e instanceof Error ? e.message : e);
      throw new HttpError(503, "Could not record the RFQ. Try again.");
    }

    return this.finish(act, input.side, ref);
  }

  private async finish(act: Active, side: string, ref: RefPrice): Promise<RfqResult> {
    const long = side === "BUY" || side === "LONG"; // taker pays: lower is better. Otherwise higher is better.
    const valid = act.entries.filter((e): e is Entry & { verdict: { ok: true; net: number } } => e.verdict.ok);
    valid.sort((a, b) => (long ? a.verdict.net - b.verdict.net : b.verdict.net - a.verdict.net));
    const rejected = act.entries.filter((e) => !e.verdict.ok);
    const best = valid[0];

    for (const e of act.entries) {
      const outcome = !e.verdict.ok ? "rejected" : e === best ? "won" : "lost";
      this.db
        .query(`INSERT INTO quotes (rfq_id, mm_id, payload, signature, net_price, received_ms, outcome, reject_reason) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING`, [
          act.id, e.mm.id, JSON.stringify(e.quote), e.signature, e.verdict.ok ? e.verdict.net.toFixed(12) : null, e.receivedMs, outcome, e.verdict.ok ? null : e.verdict.reason,
        ])
        .catch((err) => console.error("quote insert failed:", err.message));
      const conn = this.conns.get(e.mm.id);
      if (conn && e.verdict.ok) this.send(conn, { type: "quote.result", rfqId: act.id, status: e === best ? "WON" : "LOST" });
    }
    this.db.query(`UPDATE rfqs SET status = 'closed' WHERE rfq_id = $1`, [act.id]).catch((err) => console.error("rfq update failed:", err.message));

    const quotes: RankedQuote[] = valid.map((e) => ({ id: `${act.id}-${e.mm.id}`, makerName: e.mm.name, quote: e.quote, signature: e.signature, latencyMs: e.receivedMs, simulated: e.mm.simulated }));
    return {
      rfqId: act.id,
      issuedAt: Date.now(),
      product: act.product,
      side,
      ref: { mid: ref.mid, bid: ref.bid, ask: ref.ask, generatedAt: ref.generatedAt },
      executable: true,
      simulated: quotes.length > 0 && quotes.every((q) => q.simulated),
      rejected: rejected.length,
      quotes,
    };
  }
}
