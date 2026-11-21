import { randomBytes } from "node:crypto";
import { isAddress, getAddress, type Address, type Hex } from "viem";
import { z } from "zod";
import { newApiKey } from "./auth.js";
import type { Chain } from "./chain.js";
import type { Db } from "./db.js";
import { HttpError, type Hub } from "./hub.js";

// Market maker portal API. Login = sign a one-time message with the maker wallet. No passwords.
// Sessions and nonces live in memory: one Railway instance, and a restart only means "sign in again".
// ponytail: move both to Postgres if the relay ever runs on more than one instance.

const NONCE_TTL_MS = 5 * 60_000;
const SESSION_TTL_MS = 8 * 3600_000;
const nonces = new Map<string, { wallet: string; exp: number }>();
const sessions = new Map<string, { accountId: number; wallet: string; exp: number }>();

const sweep = () => {
  const now = Date.now();
  for (const [k, v] of nonces) if (v.exp < now) nonces.delete(k);
  for (const [k, v] of sessions) if (v.exp < now) sessions.delete(k);
};

export const loginMessage = (wallet: string, nonce: string, chainId: number, expISO: string) =>
  `Cold Harbor market maker sign-in\n\nWallet: ${wallet}\nChain: ${chainId}\nNonce: ${nonce}\nExpires: ${expISO}\n\nThis signature only proves you control the wallet. It does not send a transaction or approve any spend.`;

const limitsInput = z
  .object({
    ticker: z.string().regex(/^(\*|[A-Z0-9.]{1,10})$/),
    maxNotional: z.string().regex(/^\d{1,30}$/), // USDG, 6 dp
    maxOpenForwards: z.number().int().min(0).max(10_000),
  })
  .strict();

export type PortalReply = { status: number; body: unknown };

export function createPortal(opts: { db: Db; chain: Chain; hub: Hub; chainId: number; knownTickers: () => string[] }) {
  const { db, chain, hub, chainId } = opts;

  async function session(authHeader: string | undefined) {
    sweep();
    const m = /^Bearer ([A-Za-z0-9_-]{20,80})$/.exec(authHeader ?? "");
    const s = m ? sessions.get(m[1]!) : undefined;
    if (!s || s.exp < Date.now()) throw new HttpError(401, "Sign in again.");
    const r = await db.query(`SELECT status FROM mm_profiles WHERE account_id = $1`, [s.accountId]);
    if (r.rows[0]?.status !== "active") throw new HttpError(403, "This maker account is not active.");
    return s;
  }

  return {
    /** Returns null when the path is not a portal path. */
    async handle(method: string, path: string, headers: Record<string, string | string[] | undefined>, readJson: () => Promise<unknown>): Promise<PortalReply | null> {
      if (!path.startsWith("/mm/")) return null;

      if (method === "POST" && path === "/mm/nonce") {
        const b = z.object({ wallet: z.string() }).strict().safeParse(await readJson());
        if (!b.success || !isAddress(b.data.wallet)) throw new HttpError(400, "wallet must be an address.");
        const wallet = b.data.wallet.toLowerCase();
        // Same answer whether or not the wallet is a maker, so this endpoint does not reveal who is registered.
        const nonce = randomBytes(16).toString("hex");
        const exp = Date.now() + NONCE_TTL_MS;
        if (nonces.size > 5_000) sweep();
        if (nonces.size > 5_000) throw new HttpError(503, "Busy. Try again shortly.");
        nonces.set(nonce, { wallet, exp });
        return { status: 200, body: { nonce, message: loginMessage(getAddress(wallet), nonce, chainId, new Date(exp).toISOString()) } };
      }

      if (method === "POST" && path === "/mm/login") {
        const b = z.object({ wallet: z.string(), nonce: z.string().regex(/^[0-9a-f]{32}$/), signature: z.string().regex(/^0x[0-9a-fA-F]+$/).max(600) }).strict().safeParse(await readJson());
        if (!b.success || !isAddress(b.data.wallet)) throw new HttpError(400, "Invalid sign-in request.");
        const wallet = b.data.wallet.toLowerCase();
        const n = nonces.get(b.data.nonce);
        nonces.delete(b.data.nonce); // one use, even when the signature turns out to be wrong
        if (!n || n.exp < Date.now() || n.wallet !== wallet) throw new HttpError(401, "Sign-in expired. Try again.");
        const ok = await chain.client
          .verifyMessage({ address: getAddress(wallet) as Address, message: loginMessage(getAddress(wallet), b.data.nonce, chainId, new Date(n.exp).toISOString()), signature: b.data.signature as Hex })
          .catch(() => false);
        if (!ok) throw new HttpError(401, "Signature does not match this wallet.");
        const r = await db.query(`SELECT p.account_id AS id, p.status FROM mm_profiles p JOIN accounts a ON a.id = p.account_id WHERE a.wallet = $1`, [wallet]);
        const row = r.rows[0];
        if (!row) throw new HttpError(403, "This wallet is not a registered market maker. Ask Cold Harbor to onboard it.");
        if (row.status !== "active") throw new HttpError(403, "This maker account is not active.");
        const token = randomBytes(32).toString("base64url");
        sessions.set(token, { accountId: Number(row.id), wallet, exp: Date.now() + SESSION_TTL_MS });
        return { status: 200, body: { token, expiresInSec: SESSION_TTL_MS / 1000 } };
      }

      // Everything below needs a session.
      const s = await session(String(headers.authorization ?? ""));

      if (method === "POST" && path === "/mm/logout") {
        const t = String(headers.authorization ?? "").slice(7);
        sessions.delete(t);
        return { status: 200, body: { ok: true } };
      }

      if (method === "GET" && path === "/mm/me") {
        const p = await db.query(`SELECT name, api_key_prefix, status, simulated FROM mm_profiles WHERE account_id = $1`, [s.accountId]);
        const l = await db.query(`SELECT ticker, max_notional, max_open_forwards FROM mm_limits WHERE mm_id = $1 ORDER BY ticker`, [s.accountId]);
        const row = p.rows[0];
        return {
          status: 200,
          body: {
            wallet: s.wallet,
            name: row.name,
            status: row.status,
            simulated: row.simulated,
            apiKeyPrefix: row.api_key_prefix,
            connected: hub.isConnected(s.accountId),
            wsPath: "/mm/ws",
            limits: l.rows.map((x) => ({ ticker: x.ticker, maxNotional: String(x.max_notional), maxOpenForwards: x.max_open_forwards })),
            tickers: opts.knownTickers(),
          },
        };
      }

      if (method === "POST" && path === "/mm/key") {
        const k = newApiKey();
        await db.query(`UPDATE mm_profiles SET api_key_hash = $2, api_key_prefix = $3 WHERE account_id = $1`, [s.accountId, k.hash, k.prefix]);
        hub.disconnect(s.accountId, "API key rotated"); // the old key must stop working at once
        return { status: 200, body: { apiKey: k.key, note: "Shown once. Only a hash is stored." } };
      }

      if (method === "PUT" && path === "/mm/limits") {
        const b = limitsInput.safeParse(await readJson());
        if (!b.success) throw new HttpError(400, "Invalid limit: " + b.error.issues[0]?.path.join(".") + " " + b.error.issues[0]?.message);
        if (b.data.ticker !== "*" && !opts.knownTickers().includes(b.data.ticker)) throw new HttpError(404, "Unknown ticker.");
        // max_per_taker is kept equal to max_notional: per-quote cap only, no per-taker aggregate yet.
        await db.query(
          `INSERT INTO mm_limits (mm_id, ticker, max_notional, max_per_taker, max_open_forwards) VALUES ($1,$2,$3,$3,$4)
           ON CONFLICT (mm_id, ticker) DO UPDATE SET max_notional = $3, max_per_taker = $3, max_open_forwards = $4`,
          [s.accountId, b.data.ticker, b.data.maxNotional, b.data.maxOpenForwards]
        );
        return { status: 200, body: { ok: true } };
      }

      if (method === "DELETE" && path.startsWith("/mm/limits/")) {
        const t = decodeURIComponent(path.slice("/mm/limits/".length));
        await db.query(`DELETE FROM mm_limits WHERE mm_id = $1 AND ticker = $2`, [s.accountId, t]);
        return { status: 200, body: { ok: true } };
      }

      if (method === "GET" && path === "/mm/quotes") {
        const r = await db.query(
          `SELECT q.rfq_id, r.product, r.ticker, r.side, q.outcome, q.reject_reason, q.received_ms, q.net_price, r.created_at
             FROM quotes q JOIN rfqs r ON r.rfq_id = q.rfq_id WHERE q.mm_id = $1 ORDER BY q.id DESC LIMIT 100`,
          [s.accountId]
        );
        return { status: 200, body: { items: r.rows } };
      }

      if (method === "GET" && path === "/mm/positions") {
        const r = await db.query(
          `SELECT id, taker, ticker, taker_side, qty, strike, maturity_close_ts, status, open_tx
             FROM forwards WHERE maker = $1 ORDER BY id DESC LIMIT 200`,
          [s.wallet]
        );
        return { status: 200, body: { items: r.rows } };
      }

      if (method === "GET" && path === "/mm/stats") {
        const q = await db.query(
          `SELECT outcome, received_ms FROM quotes WHERE mm_id = $1 AND received_ms IS NOT NULL ORDER BY id DESC LIMIT 500`,
          [s.accountId]
        );
        const total = q.rows.length;
        const won = q.rows.filter((x) => x.outcome === "won" || x.outcome === "filled").length;
        const latencies = q.rows.map((x) => Number(x.received_ms)).sort((a, b) => a - b);
        const medianLatencyMs = latencies.length ? latencies[Math.floor(latencies.length / 2)] : null;
        const vol = await db.query(
          `SELECT COALESCE(SUM(maker_amount::numeric), 0)::text AS total FROM fills WHERE maker = $1 AND block_time > now() - interval '24 hours'`,
          [s.wallet]
        );
        const openForwards = await db.query(`SELECT count(*)::int AS n FROM forwards WHERE maker = $1 AND status = 'open'`, [s.wallet]);
        return {
          status: 200,
          body: {
            quotesLast500: total,
            hitRate: total ? won / total : null,
            medianLatencyMs,
            volume24hBaseUnits: vol.rows[0].total,
            openForwards: openForwards.rows[0].n,
          },
        };
      }

      return { status: 404, body: { error: "Not found." } };
    },
  };
}
