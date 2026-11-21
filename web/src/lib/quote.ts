import type { Address, Hex } from "viem";
import { STOCK_DECIMALS, USDG_DECIMALS } from "./chain";

export type Side = "BUY" | "SELL";

/** Quote as it travels over the wire (bigints as strings). Matches ColdHarborSettlement.Quote. */
export type WireQuote = {
  maker: Address;
  taker: Address;
  makerToken: Address;
  takerToken: Address;
  makerAmount: string;
  takerAmount: string;
  expiry: number;
  nonceBucket: string;
  nonce: string;
  feeBps: number;
  rfqId: Hex;
};

export type MakerQuote = {
  id: string;
  makerName: string;
  quote: WireQuote;
  signature: Hex | null;
  latencyMs: number;
};

export type RfqResponse = {
  rfqId: Hex;
  /** Server clock (ms) when issued. Countdown uses expiry minus this, so client clock skew does not matter. */
  issuedAt: number;
  side: Side;
  ref: { mid: number; bid: number; ask: number; generatedAt: string };
  executable: boolean;
  simulated: boolean;
  quotes: MakerQuote[];
};

export const toContractQuote = (w: WireQuote) => ({
  maker: w.maker,
  taker: w.taker,
  makerToken: w.makerToken,
  takerToken: w.takerToken,
  makerAmount: BigInt(w.makerAmount),
  takerAmount: BigInt(w.takerAmount),
  expiry: BigInt(w.expiry),
  nonceBucket: BigInt(w.nonceBucket),
  nonce: BigInt(w.nonce),
  feeBps: w.feeBps,
  rfqId: w.rfqId,
});

/** Mirrors the contract: fee = usdgAmount * feeBps / 10_000 (rounded down). */
export const feeOf = (usdg: bigint, bps: number) => (usdg * BigInt(bps)) / 10_000n;

export type QuoteView = {
  stockAmount: bigint; // 18 dp
  usdgAmount: bigint; // 6 dp, the signed price leg
  fee: bigint; // 6 dp
  price: number; // USDG per token
  /** What leaves / enters the taker wallet in USDG, fee included. */
  usdgNet: bigint;
};

export function viewOf(side: Side, w: WireQuote): QuoteView {
  const stockAmount = BigInt(side === "BUY" ? w.makerAmount : w.takerAmount);
  const usdgAmount = BigInt(side === "BUY" ? w.takerAmount : w.makerAmount);
  const fee = feeOf(usdgAmount, w.feeBps);
  const price = Number((usdgAmount * 10n ** BigInt(STOCK_DECIMALS)) / stockAmount) / 10 ** USDG_DECIMALS;
  return { stockAmount, usdgAmount, fee, price, usdgNet: side === "BUY" ? usdgAmount + fee : usdgAmount - fee };
}

/** Basis points of the quote price versus the reference mid. Positive = price above mid. */
export const bpsVs = (price: number, ref: number) => ((price - ref) / ref) * 10_000;

/** Rank: lower is better for the taker. */
export const rankKey = (side: Side, v: QuoteView) => (side === "BUY" ? Number(v.usdgNet) : -Number(v.usdgNet));

// ---------------------------------------------------------------- formatting
export const fmtUsd = (n: number, dp = 2) =>
  n.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });

export function fmtUnits(v: bigint, decimals: number, dp = 2) {
  const neg = v < 0n;
  const abs = neg ? -v : v;
  const s = abs.toString().padStart(decimals + 1, "0");
  const whole = s.slice(0, -decimals) || "0";
  const frac = s.slice(-decimals).slice(0, dp).padEnd(dp, "0");
  const w = BigInt(whole).toLocaleString("en-US");
  return `${neg ? "-" : ""}${w}${dp ? "." + frac : ""}`;
}

export const shortAddr = (a?: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");
