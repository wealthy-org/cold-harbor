// Portal auth and limits test against a running relay (localhost:8080) and Neon. Uses a temporary maker that is deleted at the end.
import { loadEnvFile } from "node:process";
import WebSocket from "ws";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { loadConfig } from "../src/config.js";
import { connect } from "../src/db.js";

try { loadEnvFile(".env"); } catch { /* env may come from the shell */ }
const cfg = loadConfig();
const db = connect(cfg.DATABASE_URL);
const B = "http://localhost:8080";
const acct = privateKeyToAccount(generatePrivateKey());
const stranger = privateKeyToAccount(generatePrivateKey());
let failed = 0;
const check = (name: string, ok: boolean, detail = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  " + detail : ""}`); if (!ok) failed++; };
const api = async (method: string, path: string, body?: unknown, token?: string) => {
  const r = await fetch(B + path, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: r.status, json: (await r.json().catch(() => ({}))) as any }; // eslint-disable-line @typescript-eslint/no-explicit-any
};
const signIn = async (signer: typeof acct, wallet = signer.address) => {
  const n = await api("POST", "/mm/nonce", { wallet });
  const signature = await signer.signMessage({ message: n.json.message });
  return { nonce: n.json.nonce as string, signature, res: () => api("POST", "/mm/login", { wallet, nonce: n.json.nonce, signature }) };
};

try {
  const w = acct.address.toLowerCase();
  const a = await db.query(`INSERT INTO accounts (wallet, role) VALUES ($1,'mm') RETURNING id`, [w]);
  await db.query(`INSERT INTO mm_profiles (account_id, name, status) VALUES ($1,'Portal Test Maker','active')`, [a.rows[0].id]);

  check("no session -> 401", (await api("GET", "/mm/me")).status === 401);
  check("garbage token -> 401", (await api("GET", "/mm/me", undefined, "x".repeat(40))).status === 401);

  const s1 = await signIn(acct);
  const ok = await s1.res();
  check("valid signature logs in", ok.status === 200 && typeof ok.json.token === "string");
  const token = ok.json.token as string;
  check("replaying the same nonce is refused", (await s1.res()).status === 401);

  const s2 = await signIn(acct);
  const badSig = await signIn(stranger, acct.address); // stranger signs the maker's message
  check("signature from another wallet is refused", (await badSig.res()).status === 401);
  const n3 = await api("POST", "/mm/nonce", { wallet: acct.address });
  const sigOther = await acct.signMessage({ message: n3.json.message + " " });
  check("tampered message is refused", (await api("POST", "/mm/login", { wallet: acct.address, nonce: n3.json.nonce, signature: sigOther })).status === 401);
  void s2;

  const sx = await signIn(stranger);
  check("unregistered wallet cannot log in", (await sx.res()).status === 403);

  const me = await api("GET", "/mm/me", undefined, token);
  check("GET /mm/me", me.status === 200 && me.json.name === "Portal Test Maker" && me.json.connected === false, `connected=${me.json.connected}`);

  check("limit with bad ticker -> 404", (await api("PUT", "/mm/limits", { ticker: "ZZZZ", maxNotional: "1000", maxOpenForwards: 0 }, token)).status === 404);
  check("limit with extra field -> 400", (await api("PUT", "/mm/limits", { ticker: "NVDA", maxNotional: "1000", maxOpenForwards: 0, x: 1 }, token)).status === 400);
  check("limit with negative number -> 400", (await api("PUT", "/mm/limits", { ticker: "NVDA", maxNotional: "-5", maxOpenForwards: 0 }, token)).status === 400);
  check("set limit NVDA", (await api("PUT", "/mm/limits", { ticker: "NVDA", maxNotional: "50000000000", maxOpenForwards: 3 }, token)).status === 200);
  const me2 = await api("GET", "/mm/me", undefined, token);
  check("limit is stored", me2.json.limits?.[0]?.ticker === "NVDA" && me2.json.limits[0].maxOpenForwards === 3);

  // Key rotation: new key connects, old key is cut off, the rotation request drops the live socket.
  const k1 = await api("POST", "/mm/key", undefined, token);
  check("key issued once", k1.status === 200 && /^chk_/.test(k1.json.apiKey));
  const ws1 = new WebSocket("ws://localhost:8080/mm/ws", { headers: { "x-api-key": k1.json.apiKey } });
  await new Promise<void>((r) => { ws1.once("open", () => r()); ws1.once("error", () => r()); });
  check("new key connects", ws1.readyState === WebSocket.OPEN);
  const me3 = await api("GET", "/mm/me", undefined, token);
  check("portal shows maker connected", me3.json.connected === true);
  const closed = new Promise<number>((r) => ws1.once("close", (c) => r(c)));
  const k2 = await api("POST", "/mm/key", undefined, token);
  check("rotation drops the live connection", (await Promise.race([closed, new Promise<number>((r) => setTimeout(() => r(-1), 3000))])) === 4001);
  const old = await new Promise<number>((r) => {
    const w2 = new WebSocket("ws://localhost:8080/mm/ws", { headers: { "x-api-key": k1.json.apiKey } });
    w2.once("unexpected-response", (_q, resp) => r(resp.statusCode ?? 0));
    w2.once("open", () => { w2.close(); r(200); });
    w2.once("error", () => r(0));
  });
  check("old key no longer works", old === 401, `HTTP ${old}`);
  void k2;

  const lo = await api("POST", "/mm/logout", undefined, token);
  check("logout", lo.status === 200);
  check("session is dead after logout", (await api("GET", "/mm/me", undefined, token)).status === 401);

  await db.query(`UPDATE mm_profiles SET status='suspended' WHERE account_id=$1`, [a.rows[0].id]);
  const s4 = await signIn(acct);
  check("suspended maker cannot log in", (await s4.res()).status === 403);
} finally {
  await db.query(`DELETE FROM accounts WHERE wallet = $1`, [acct.address.toLowerCase()]);
  await db.end();
}
console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
