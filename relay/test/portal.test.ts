// Real vitest integration test for the maker portal: boots the relay in-process (ephemeral port),
// exercises sign-in, limits, API key rotation and the WebSocket upgrade against a live Postgres (Neon).
// Needs DATABASE_URL in the environment (same one the dev relay uses). Cleans up its own temp maker.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { loadConfig } from "../src/config.js";
import { buildRelay } from "../src/server.js";

const cfg = loadConfig();
let relay: Awaited<ReturnType<typeof buildRelay>>;
let base: string;
let wsBase: string;

const acct = privateKeyToAccount(generatePrivateKey());
const stranger = privateKeyToAccount(generatePrivateKey());

type ApiResult = { status: number; json: Record<string, unknown> };
const api = async (method: string, path: string, body?: unknown, token?: string): Promise<ApiResult> => {
  const r = await fetch(base + path, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, json: (await r.json().catch(() => ({}))) as Record<string, unknown> };
};
const signIn = async (signer: typeof acct, wallet = signer.address) => {
  const n = await api("POST", "/mm/nonce", { wallet });
  const signature = await signer.signMessage({ message: n.json.message as string });
  return { res: () => api("POST", "/mm/login", { wallet, nonce: n.json.nonce, signature }) };
};

let accountId: number;

beforeAll(async () => {
  relay = buildRelay(cfg);
  await new Promise<void>((resolve) => relay.server.listen(0, resolve));
  const addr = relay.server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  base = `http://127.0.0.1:${port}`;
  wsBase = `ws://127.0.0.1:${port}`;

  const w = acct.address.toLowerCase();
  const a = await relay.db.query(`INSERT INTO accounts (wallet, role) VALUES ($1,'mm') RETURNING id`, [w]);
  accountId = a.rows[0].id as number;
  await relay.db.query(`INSERT INTO mm_profiles (account_id, name, status) VALUES ($1,'Vitest Portal Maker','active')`, [accountId]);
});

afterAll(async () => {
  await relay.db.query(`DELETE FROM accounts WHERE wallet = $1`, [acct.address.toLowerCase()]);
  await relay.stop();
});

describe("maker portal auth", () => {
  it("rejects requests with no session", async () => {
    expect((await api("GET", "/mm/me")).status).toBe(401);
  });

  it("rejects a garbage token", async () => {
    expect((await api("GET", "/mm/me", undefined, "x".repeat(40))).status).toBe(401);
  });

  it("logs in with a valid signature and refuses to replay the nonce", async () => {
    const s1 = await signIn(acct);
    const ok = await s1.res();
    expect(ok.status).toBe(200);
    expect(typeof ok.json.token).toBe("string");
    expect((await s1.res()).status).toBe(401); // same nonce, already consumed
  });

  it("refuses a signature from another wallet", async () => {
    const bad = await signIn(stranger, acct.address);
    expect((await bad.res()).status).toBe(401);
  });

  it("refuses a tampered message", async () => {
    const n = await api("POST", "/mm/nonce", { wallet: acct.address });
    const sig = await acct.signMessage({ message: (n.json.message as string) + " " });
    const r = await api("POST", "/mm/login", { wallet: acct.address, nonce: n.json.nonce, signature: sig });
    expect(r.status).toBe(401);
  });

  it("refuses an unregistered wallet", async () => {
    const sx = await signIn(stranger);
    expect((await sx.res()).status).toBe(403);
  });
});

describe("maker portal session", () => {
  let token: string;

  beforeAll(async () => {
    const s = await signIn(acct);
    const r = await s.res();
    token = r.json.token as string;
  });

  it("GET /mm/me returns the maker profile, not connected yet", async () => {
    const me = await api("GET", "/mm/me", undefined, token);
    expect(me.status).toBe(200);
    expect(me.json.name).toBe("Vitest Portal Maker");
    expect(me.json.connected).toBe(false);
  });

  it("validates limit inputs", async () => {
    expect((await api("PUT", "/mm/limits", { ticker: "ZZZZ", maxNotional: "1000", maxOpenForwards: 0 }, token)).status).toBe(404);
    expect((await api("PUT", "/mm/limits", { ticker: "NVDA", maxNotional: "1000", maxOpenForwards: 0, x: 1 }, token)).status).toBe(400);
    expect((await api("PUT", "/mm/limits", { ticker: "NVDA", maxNotional: "-5", maxOpenForwards: 0 }, token)).status).toBe(400);
  });

  it("sets and stores a limit", async () => {
    expect((await api("PUT", "/mm/limits", { ticker: "NVDA", maxNotional: "50000000000", maxOpenForwards: 3 }, token)).status).toBe(200);
    const me = await api("GET", "/mm/me", undefined, token);
    const limits = me.json.limits as { ticker: string; maxOpenForwards: number }[];
    expect(limits[0]?.ticker).toBe("NVDA");
    expect(limits[0]?.maxOpenForwards).toBe(3);
  });

  it("GET /mm/positions and /mm/stats respond for a maker with no activity yet", async () => {
    const pos = await api("GET", "/mm/positions", undefined, token);
    expect(pos.status).toBe(200);
    expect(Array.isArray(pos.json.items)).toBe(true);
    const stats = await api("GET", "/mm/stats", undefined, token);
    expect(stats.status).toBe(200);
    expect(stats.json.quotesLast500).toBe(0);
  });

  it("rotates the API key and drops the live WebSocket", async () => {
    const k1 = await api("POST", "/mm/key", undefined, token);
    expect(k1.status).toBe(200);
    expect(k1.json.apiKey as string).toMatch(/^chk_/);

    const ws1 = new WebSocket(`${wsBase}/mm/ws`, { headers: { "x-api-key": k1.json.apiKey as string } });
    await new Promise<void>((r) => {
      ws1.once("open", () => r());
      ws1.once("error", () => r());
    });
    expect(ws1.readyState).toBe(WebSocket.OPEN);

    const me = await api("GET", "/mm/me", undefined, token);
    expect(me.json.connected).toBe(true);

    const closed = new Promise<number>((r) => ws1.once("close", (c) => r(c)));
    await api("POST", "/mm/key", undefined, token); // rotate again: must cut the live socket
    const code = await Promise.race([closed, new Promise<number>((r) => setTimeout(() => r(-1), 3000))]);
    expect(code).toBe(4001);

    const refused = await new Promise<number>((r) => {
      const w2 = new WebSocket(`${wsBase}/mm/ws`, { headers: { "x-api-key": k1.json.apiKey as string } });
      w2.once("unexpected-response", (_q, resp) => r(resp.statusCode ?? 0));
      w2.once("open", () => {
        w2.close();
        r(200);
      });
      w2.once("error", () => r(0));
    });
    expect(refused).toBe(401); // the old key must not work after rotation
  });

  it("logs out and invalidates the session", async () => {
    expect((await api("POST", "/mm/logout", undefined, token)).status).toBe(200);
    expect((await api("GET", "/mm/me", undefined, token)).status).toBe(401);
  });

  it("refuses sign-in once the maker is suspended", async () => {
    await relay.db.query(`UPDATE mm_profiles SET status='suspended' WHERE account_id=$1`, [accountId]);
    const s = await signIn(acct);
    expect((await s.res()).status).toBe(403);
  });
});
