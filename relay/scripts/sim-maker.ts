// TESTNET ONLY. Four simulated market makers that connect to the relay over WebSocket exactly like a real maker would:
// listen for rfq.request, sign an EIP-712 quote with a throwaway key, send quote.submit. Prices are the real reference
// from the request plus a spread (and carry for forwards). Keys come from .env.sim, written by `pnpm sim:setup`.
import { loadEnvFile } from "node:process";
import { randomBytes } from "node:crypto";
import WebSocket from "ws";
import { privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";
import { FORWARD_TYPES, SPOT_TYPES } from "../src/validate.js";

loadEnvFile(".env.sim");
const RELAY = process.env.RELAY_WS ?? `ws://localhost:${process.env.PORT ?? 8080}/mm/ws`;
const pks = (process.env.SIM_MAKER_PKS ?? "").split(",").filter(Boolean) as Hex[];
const keys = (process.env.SIM_API_KEYS ?? "").split(",").filter(Boolean);
if (!pks.length || pks.length !== keys.length) throw new Error("run `pnpm sim:setup` first (.env.sim is missing or inconsistent)");

const NAMES = ["Sim Maker A", "Sim Maker B", "Sim Maker C", "Sim Maker D"];
const SPOT_SPREAD = [4, 9, 13, 19];
const FWD_SPREAD = [6, 11, 16, 24];
const DELAY_MS = [250, 450, 650, 850]; // stays inside the 1500 ms deadline
const CARRY_APY = 0.04;
const rand = (n: number) => Math.random() * n;
const u128 = () => BigInt("0x" + randomBytes(16).toString("hex")).toString();

type Req = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

async function build(i: number, r: Req): Promise<{ quote: Record<string, unknown>; signature: Hex } | null> {
  const acct = privateKeyToAccount(pks[i]!);
  const ref = Number(r.oracleRef.price) / 1e8;
  const expiry = Math.floor(Date.now() / 1000) + 25;
  if (r.product === "spot") {
    const buy = r.side === "BUY";
    const bps = SPOT_SPREAD[i]! + (rand(3) - 1.5);
    const px = buy ? ref * (1 + bps / 1e4) : ref * (1 - bps / 1e4);
    const base = BigInt(r.baseAmount);
    const prod = base * BigInt(Math.round(px * 1e6));
    const usdg = buy ? (prod + 10n ** 18n - 1n) / 10n ** 18n : prod / 10n ** 18n; // round against the taker
    const q = {
      maker: acct.address, taker: r.taker, makerToken: buy ? r.baseToken.address : r.quoteToken.address, takerToken: buy ? r.quoteToken.address : r.baseToken.address,
      makerAmount: (buy ? base : usdg).toString(), takerAmount: (buy ? usdg : base).toString(), expiry, nonceBucket: "1", nonce: u128(), feeBps: r.feeBps, rfqId: r.rfqId,
    };
    const signature = await acct.signTypedData({
      domain: r.domain, types: SPOT_TYPES, primaryType: "Quote",
      message: { ...q, makerAmount: BigInt(q.makerAmount), takerAmount: BigInt(q.takerAmount), expiry: BigInt(expiry), nonceBucket: 1n, nonce: BigInt(q.nonce) },
    });
    return { quote: q, signature };
  }
  const long = r.side === "LONG";
  const days = (r.maturityCloseTs - Date.now() / 1000) / 86400;
  const fair = ref * (1 + (CARRY_APY * days) / 365);
  const bps = FWD_SPREAD[i]! + (rand(3) - 1.5);
  const strike = BigInt(Math.round((long ? fair * (1 + bps / 1e4) : fair * (1 - bps / 1e4)) * 1e8));
  const q = {
    maker: acct.address, taker: r.taker, stockToken: r.stockToken, side: long ? 0 : 1, qty: r.qty, strike: strike.toString(), maturityCloseTs: r.maturityCloseTs,
    imBps: r.imBps, mmBps: r.mmBps, feeBps: r.feeBps, expiry, nonceBucket: "1", nonce: u128(), rfqId: r.rfqId,
  };
  const signature = await acct.signTypedData({
    domain: r.domain, types: FORWARD_TYPES, primaryType: "ForwardQuote",
    message: { ...q, side: q.side, qty: BigInt(q.qty), strike, maturityCloseTs: BigInt(q.maturityCloseTs), expiry: BigInt(expiry), nonceBucket: 1n, nonce: BigInt(q.nonce) },
  });
  return { quote: q, signature };
}

function run(i: number) {
  const name = NAMES[i] ?? `Sim Maker ${i + 1}`;
  const connect = () => {
    const ws = new WebSocket(RELAY, { headers: { "x-api-key": keys[i]! } });
    ws.on("open", () => console.log(`${name} connected`));
    ws.on("message", async (raw) => {
      const m = JSON.parse(raw.toString()) as Req;
      if (m.type === "rfq.request") {
        await new Promise((r) => setTimeout(r, DELAY_MS[i]! + rand(80)));
        const out = await build(i, m);
        if (out) ws.send(JSON.stringify({ type: "quote.submit", rfqId: m.rfqId, quote: out.quote, signature: out.signature }));
      } else if (m.type === "quote.ack" && m.status === "rejected") console.log(`${name}: quote rejected: ${m.reason}`);
      else if (m.type === "quote.result") console.log(`${name}: ${m.status} ${String(m.rfqId).slice(0, 10)}`);
    });
    ws.on("close", (code) => {
      console.log(`${name} disconnected (${code}), retrying in 2s`);
      setTimeout(connect, 2_000);
    });
    ws.on("error", (e) => console.log(`${name} error: ${e.message}`));
  };
  connect();
}
pks.forEach((_, i) => run(i));
