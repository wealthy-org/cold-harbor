// Connects as a legitimate maker (Sim Maker A) and submits deliberately bad quotes. Every one must be rejected with a reason.
import { loadEnvFile } from "node:process";
import { randomBytes } from "node:crypto";
import WebSocket from "ws";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import type { Hex } from "viem";
import { SPOT_TYPES } from "../src/validate.js";

loadEnvFile(".env.sim");
const pk = process.env.SIM_MAKER_PKS!.split(",")[0] as Hex;
const key = process.env.SIM_API_KEYS!.split(",")[0]!;
const acct = privateKeyToAccount(pk);
const u128 = () => BigInt("0x" + randomBytes(16).toString("hex")).toString();
const taker = "0xf1c9fE6816C8f43b3c8f31e020D27BFDed49d31A";

// 1. no key / wrong key must not connect
for (const k of ["", "chk_" + "x".repeat(43)]) {
  await new Promise<void>((res) => {
    const w = new WebSocket("ws://localhost:8080/mm/ws", { headers: { "x-api-key": k } });
    w.on("unexpected-response", (_r, resp) => { console.log(`connect with key "${k.slice(0, 6)}": HTTP ${resp.statusCode}`); res(); });
    w.on("open", () => { console.log("BUG: connected without a valid key"); w.close(); res(); });
    w.on("error", () => res());
  });
}

const ws = new WebSocket("ws://localhost:8080/mm/ws", { headers: { "x-api-key": key } });
await new Promise((r) => ws.once("open", r));
// Take over Sim Maker A's slot: the simulator is still running, so this test replaces it for a few seconds.

type Mut = (q: Record<string, any>) => Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const cases: [string, Mut, "wrongSigner"?][] = [
  ["good quote (control)", (q) => q],
  ["fee 0 instead of protocol fee", (q) => ({ ...q, feeBps: 0 })],
  ["price 10% off reference", (q) => ({ ...q, takerAmount: (BigInt(q.takerAmount) * 90n / 100n).toString() })],
  ["wrong amount", (q) => ({ ...q, makerAmount: (BigInt(q.makerAmount) + 1n).toString() })],
  ["expiry too short", (q) => ({ ...q, expiry: Math.floor(Date.now() / 1000) + 3 })],
  ["expiry too long", (q) => ({ ...q, expiry: Math.floor(Date.now() / 1000) + 600 })],
  ["someone else's maker address", (q) => ({ ...q, maker: "0x000000000000000000000000000000000000dEaD" })],
  ["signed by an unregistered key", (q) => q, "wrongSigner"],
];

for (const [name, mut, flag] of cases) {
  const got = await new Promise<string>((resolve) => {
    const onMsg = async (raw: WebSocket.RawData) => {
      const m = JSON.parse(raw.toString());
      if (m.type !== "rfq.request" || m.product !== "spot" || m.side !== "BUY") return;
      ws.off("message", onMsg);
      const base = BigInt(m.baseAmount);
      const ref = Number(m.oracleRef.price) / 1e8;
      const usdg = (base * BigInt(Math.round(ref * 1.0004 * 1e6)) + 10n ** 18n - 1n) / 10n ** 18n;
      const q0 = { maker: acct.address, taker: m.taker, makerToken: m.baseToken.address, takerToken: m.quoteToken.address, makerAmount: base.toString(), takerAmount: usdg.toString(), expiry: Math.floor(Date.now() / 1000) + 25, nonceBucket: "1", nonce: u128(), feeBps: m.feeBps, rfqId: m.rfqId };
      const q = mut(q0);
      const signer = flag ? privateKeyToAccount(generatePrivateKey()) : acct;
      const signature = await signer.signTypedData({ domain: m.domain, types: SPOT_TYPES, primaryType: "Quote", message: { ...(q as any), makerAmount: BigInt(q.makerAmount), takerAmount: BigInt(q.takerAmount), expiry: BigInt(q.expiry), nonceBucket: 1n, nonce: BigInt(q.nonce) } });
      const acks: string[] = [];
      const ack = (raw2: WebSocket.RawData) => {
        const a = JSON.parse(raw2.toString());
        if (a.type !== "quote.ack") return;
        acks.push(a.status === "accepted" ? "ACCEPTED" : "rejected: " + a.reason);
        const want = name.startsWith("good") ? 2 : 1; // the control also sends a duplicate, so it gets two acks
        if (acks.length >= want) { ws.off("message", ack); resolve(acks.join("  |  then  ")); }
      };
      ws.on("message", ack);
      ws.send(JSON.stringify({ type: "quote.submit", rfqId: m.rfqId, quote: q, signature }));
      // a second submit for the same RFQ from the same maker must be refused
      if (name.startsWith("good")) setTimeout(() => ws.send(JSON.stringify({ type: "quote.submit", rfqId: m.rfqId, quote: q0, signature })), 150);
    };
    ws.on("message", onMsg);
    void fetch("http://localhost:8080/rfq", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ product: "spot", ticker: "NVDA", side: "BUY", baseAmount: (100n * 10n ** 18n).toString(), taker }) });
  });
  console.log(`${name.padEnd(34)} -> ${got}`);
  await new Promise((r) => setTimeout(r, 2500));
}
ws.close();
process.exit(0);
