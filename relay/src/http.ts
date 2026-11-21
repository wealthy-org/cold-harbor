import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { Config } from "./config.js";
import { ETFS } from "./config.js";
import type { Db } from "./db.js";
import { HttpError, type Hub } from "./hub.js";
import { rfqInput } from "./protocol.js";
import type { createPortal } from "./portal.js";
import type { Close } from "./close.js";

const MAX_BODY = 8 * 1024;

/** In-memory token bucket per client. One Railway instance, so memory is enough. */
class Limiter {
  private buckets = new Map<string, { tokens: number; at: number }>();
  constructor(private perMinute: number) {}
  take(key: string): boolean {
    const now = Date.now();
    const b = this.buckets.get(key) ?? { tokens: this.perMinute, at: now };
    b.tokens = Math.min(this.perMinute, b.tokens + ((now - b.at) / 60_000) * this.perMinute);
    b.at = now;
    const ok = b.tokens >= 1;
    if (ok) b.tokens -= 1;
    this.buckets.set(key, b);
    if (this.buckets.size > 10_000) for (const [k, v] of this.buckets) if (now - v.at > 120_000) this.buckets.delete(k);
    return ok;
  }
}

/** Railway puts the client address last in X-Forwarded-For. Taking the first entry would let a caller spoof it. */
export const clientIp = (req: IncomingMessage) => {
  const xff = String(req.headers["x-forwarded-for"] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return xff[xff.length - 1] ?? req.socket.remoteAddress ?? "unknown";
};

async function readJson(req: IncomingMessage): Promise<unknown> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > MAX_BODY) throw new HttpError(413, "Request body is too large.");
    chunks.push(c as Buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "Body must be valid JSON.");
  }
}

export function createHttp(cfg: Config, db: Db, hub: Hub, hooks: { indexer?: () => unknown; portal?: ReturnType<typeof createPortal>; close?: Close } = {}): Server {
  const limiter = new Limiter(cfg.RFQ_PER_MIN_PER_IP);

  const respond = (req: IncomingMessage, res: ServerResponse, status: number, body: unknown) => {
    const origin = req.headers.origin;
    const headers: Record<string, string> = { "content-type": "application/json", "x-content-type-options": "nosniff", "cache-control": "no-store" };
    if (origin && cfg.origins.includes(origin)) {
      headers["access-control-allow-origin"] = origin;
      headers["vary"] = "Origin";
    }
    res.writeHead(status, headers).end(JSON.stringify(body));
  };

  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://x");
      if (req.method === "OPTIONS") {
        const origin = req.headers.origin;
        const h: Record<string, string> = { "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS", "access-control-allow-headers": "content-type, authorization", "access-control-max-age": "600" };
        if (origin && cfg.origins.includes(origin)) h["access-control-allow-origin"] = origin;
        return void res.writeHead(204, h).end();
      }

      if (hooks.portal && url.pathname.startsWith("/mm/")) {
        // Sign-in attempts share the RFQ rate limit per IP, so nonce and login cannot be hammered.
        if (url.pathname === "/mm/nonce" || url.pathname === "/mm/login") if (!limiter.take(clientIp(req))) return respond(req, res, 429, { error: "Too many requests. Slow down." });
        const out = await hooks.portal.handle(req.method ?? "GET", url.pathname, req.headers, () => readJson(req));
        if (out) return respond(req, res, out.status, out.body);
      }

      if (req.method === "GET" && url.pathname === "/health") {
        let dbOk = false;
        try {
          await db.query("SELECT 1");
          dbOk = true;
        } catch {
          /* reported in the body */
        }
        return respond(req, res, 200, { ok: true, db: dbOk, chainId: cfg.CHAIN_ID, makersConnected: hub.connectedMakers, indexer: hooks.indexer?.() ?? null });
      }

      if (req.method === "GET" && url.pathname === "/universe") {
        const db_rows = (await db.query(`SELECT ticker, active, paused, pyth_feed_id FROM universe`)).rows as { ticker: string; active: boolean; paused: boolean; pyth_feed_id: string | null }[];
        const flags = new Map(db_rows.map((r) => [r.ticker, r]));
        const tickers = Object.entries(cfg.TOKENS).map(([ticker, token]) => ({
          ticker, token, isEtf: ETFS.has(ticker), imBps: ETFS.has(ticker) ? 1000 : 2000, forwardFeed: cfg.FW_FEEDS[ticker] ?? null,
          active: flags.get(ticker)?.active ?? true, paused: flags.get(ticker)?.paused ?? false, pythFeedId: flags.get(ticker)?.pyth_feed_id ?? null,
        }));
        return respond(req, res, 200, { chainId: cfg.CHAIN_ID, settlement: cfg.SETTLEMENT ?? null, usdg: cfg.USDG ?? null, forwardEngine: cfg.FW_ENGINE ?? null, tickers });
      }

      const me = /^\/forwards\/(\d+)\/margin-events$/.exec(url.pathname);
      if (req.method === "GET" && me) {
        const r = await db.query(
          `SELECT type, who, amount, price, tx_hash, block_time FROM margin_events WHERE forward_id = $1 ORDER BY block_time DESC LIMIT 200`,
          [me[1]]
        );
        return respond(req, res, 200, { items: r.rows });
      }

      if (req.method === "GET" && url.pathname === "/fees") {
        const totals = await db.query(`SELECT source, kind, SUM(amount_usdg)::text AS total FROM fee_ledger GROUP BY source, kind`);
        const recent = await db.query(`SELECT source, ref_id, kind, amount_usdg, block_time FROM fee_ledger ORDER BY block_time DESC LIMIT 100`);
        return respond(req, res, 200, { totals: totals.rows, recent: recent.rows });
      }

      if (req.method === "POST" && url.pathname === "/rfq") {
        if (!limiter.take(clientIp(req))) return respond(req, res, 429, { error: "Too many requests. Slow down." });
        const parsed = rfqInput.safeParse(await readJson(req));
        if (!parsed.success) return respond(req, res, 400, { error: "Invalid request: " + parsed.error.issues[0]?.path.join(".") + " " + parsed.error.issues[0]?.message });
        return respond(req, res, 200, await hub.runRfq(parsed.data));
      }

      const w = /^\/(fills|forwards|rfqs)\/(0x[0-9a-fA-F]{40})$/.exec(url.pathname);
      if (req.method === "GET" && w) {
        const wallet = w[2]!.toLowerCase();
        const sql =
          w[1] === "fills"
            ? `SELECT tx_hash, log_index, product, rfq_id, maker, taker, ticker, maker_amount, taker_amount, fee, forward_id, block_number, block_time FROM fills WHERE taker = $1 OR maker = $1 ORDER BY block_number DESC, log_index DESC LIMIT 200`
            : w[1] === "forwards"
              ? `SELECT id, rfq_id, maker, taker, ticker, taker_side, qty, strike, maturity_close_ts, status, open_tx, closed_tx, close_price FROM forwards WHERE taker = $1 OR maker = $1 ORDER BY id DESC LIMIT 200`
              : `SELECT rfq_id, product, ticker, side, amount, status, created_at FROM rfqs WHERE taker = $1 ORDER BY created_at DESC LIMIT 100`;
        return respond(req, res, 200, { items: (await db.query(sql, [wallet])).rows });
      }

      const cp = /^\/forwards\/(\d+)\/close-proposal$/.exec(url.pathname);
      if (hooks.close && cp) {
        if (req.method === "GET") return respond(req, res, 200, await hooks.close.get(cp[1]!));
        if (req.method === "POST") {
          if (!limiter.take(clientIp(req))) return respond(req, res, 429, { error: "Too many requests. Slow down." });
          return respond(req, res, 200, await hooks.close.propose(cp[1]!, await readJson(req)));
        }
      }

      const m = /^\/rfq\/(0x[0-9a-fA-F]{64})$/.exec(url.pathname);
      if (req.method === "GET" && m) {
        const id = m[1]!.toLowerCase();
        const r = await db.query(`SELECT rfq_id, taker, product, ticker, side, amount, params, status, created_at FROM rfqs WHERE rfq_id = $1`, [id]);
        const rfq = r.rows[0];
        if (!rfq) return respond(req, res, 404, { error: "RFQ not found." });
        const q = await db.query(
          `SELECT p.name, q.payload, q.signature, q.net_price, q.received_ms, q.outcome
             FROM quotes q JOIN mm_profiles p ON p.account_id = q.mm_id
            WHERE q.rfq_id = $1 AND q.outcome IN ('won','lost','filled')
            ORDER BY q.net_price ${rfq.side === "BUY" || rfq.side === "LONG" ? "ASC" : "DESC"}`,
          [id]
        );
        return respond(req, res, 200, {
          rfqId: id, status: rfq.status, product: rfq.product, ticker: rfq.ticker, side: rfq.side, taker: rfq.taker, createdAt: rfq.created_at,
          quotes: q.rows.map((x) => ({ makerName: x.name, quote: x.payload, signature: x.signature, netPrice: x.net_price, latencyMs: x.received_ms, outcome: x.outcome })),
        });
      }

      respond(req, res, 404, { error: "Not found." });
    } catch (e) {
      if (e instanceof HttpError) return respond(req, res, e.status, { error: e.message });
      console.error("request failed:", e instanceof Error ? e.message : e);
      respond(req, res, 500, { error: "Internal error." });
    }
  });
}
