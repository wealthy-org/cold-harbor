import { recoverTypedDataAddress, type Address, type Hex } from "viem";
import type { Chain } from "./chain.js";
import { ETFS, type Config } from "./config.js";
import { BASE_DECIMALS, USDG_DECIMALS, type ForwardQuote, type SpotQuote } from "./protocol.js";
import type { RefPrice } from "./prices.js";

export type Verdict = { ok: true; net: number } | { ok: false; reason: string };
const no = (reason: string): Verdict => ({ ok: false, reason });
const eq = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export const SPOT_TYPES = {
  Quote: [
    { name: "maker", type: "address" }, { name: "taker", type: "address" }, { name: "makerToken", type: "address" }, { name: "takerToken", type: "address" },
    { name: "makerAmount", type: "uint256" }, { name: "takerAmount", type: "uint256" }, { name: "expiry", type: "uint64" },
    { name: "nonceBucket", type: "uint64" }, { name: "nonce", type: "uint128" }, { name: "feeBps", type: "uint16" }, { name: "rfqId", type: "bytes32" },
  ],
} as const;

export const FORWARD_TYPES = {
  ForwardQuote: [
    { name: "maker", type: "address" }, { name: "taker", type: "address" }, { name: "stockToken", type: "address" }, { name: "side", type: "uint8" },
    { name: "qty", type: "uint256" }, { name: "strike", type: "uint256" }, { name: "maturityCloseTs", type: "uint64" },
    { name: "imBps", type: "uint16" }, { name: "mmBps", type: "uint16" }, { name: "feeBps", type: "uint16" }, { name: "expiry", type: "uint64" },
    { name: "nonceBucket", type: "uint64" }, { name: "nonce", type: "uint128" }, { name: "rfqId", type: "bytes32" },
  ],
} as const;

export type Ctx = { cfg: Config; chain: Chain; nowS: () => number };

export type SpotRfq = { id: string; taker: string; ticker: string; side: "BUY" | "SELL"; token: Address; base: bigint; ref: RefPrice };
export type ForwardRfq = { id: string; taker: string; ticker: string; side: "LONG" | "SHORT"; token: Address; qty: bigint; maturityCloseTs: number; ref: RefPrice };

const deviationBps = (price: number, ref: number) => Math.abs((price / ref - 1) * 10_000);
/** USDG leg (6 dp) and token amount (18 dp) -> USD per token. */
const unitPrice = (usdg: bigint, base: bigint) => Number(usdg) / 10 ** USDG_DECIMALS / (Number(base) / 10 ** BASE_DECIMALS);
const feeOf = (usdg: bigint, bps: number) => (usdg * BigInt(bps)) / 10_000n;

function expiryProblem(ctx: Ctx, expiry: number): string | null {
  const now = ctx.nowS();
  if (expiry < now + ctx.cfg.MIN_EXPIRY_SEC) return `expiry must be at least ${ctx.cfg.MIN_EXPIRY_SEC}s from now`;
  if (expiry > now + ctx.cfg.MAX_EXPIRY_SEC) return `expiry must be at most ${ctx.cfg.MAX_EXPIRY_SEC}s from now`;
  return null;
}

/** The signature must come from the maker or a signer the maker registered on chain, or be valid ERC-1271 for a contract maker. */
async function signatureOk(ctx: Ctx, product: "spot" | "forward", maker: Address, signature: Hex, recover: () => Promise<Address>, verify1271: () => Promise<boolean>): Promise<boolean> {
  try {
    const signer = await recover();
    if (eq(signer, maker)) return true;
    if (await ctx.chain.isSigner(product, maker, signer)) return true;
  } catch {
    /* malformed signature: fall through to ERC-1271 */
  }
  try {
    const code = await ctx.chain.client.getCode({ address: maker });
    if (code && code !== "0x") return await verify1271();
  } catch {
    /* RPC problem: treat as invalid rather than accept */
  }
  return false;
}

export async function validateSpot(ctx: Ctx, rfq: SpotRfq, mmWallet: string, q: SpotQuote, signature: Hex): Promise<Verdict> {
  const { cfg, chain } = ctx;
  if (!cfg.USDG || !cfg.SETTLEMENT) return no("relay is not configured for spot");
  if (!eq(q.rfqId, rfq.id)) return no("rfqId in the quote does not match");
  if (!eq(q.maker, mmWallet)) return no("maker must be the wallet registered to this API key");
  if (!eq(q.taker, rfq.taker)) return no("taker does not match the RFQ");

  const buy = rfq.side === "BUY";
  if (!eq(q.makerToken, buy ? rfq.token : cfg.USDG) || !eq(q.takerToken, buy ? cfg.USDG : rfq.token)) return no("token pair does not match the RFQ");
  const base = BigInt(buy ? q.makerAmount : q.takerAmount);
  const usdg = BigInt(buy ? q.takerAmount : q.makerAmount);
  if (base !== rfq.base) return no("token amount must equal the requested amount");
  if (usdg <= 0n) return no("USDG amount must be greater than zero");
  const exp = expiryProblem(ctx, q.expiry);
  if (exp) return no(exp);

  const price = unitPrice(usdg, base);
  const dev = deviationBps(price, rfq.ref.mid);
  if (dev > cfg.MAX_DEV_BPS_SPOT) return no(`price is ${dev.toFixed(0)} bps from the reference, limit is ${cfg.MAX_DEV_BPS_SPOT}`);

  const maker = q.maker as Address;
  const [fee, used, funds, allowance, sigValid] = await Promise.all([
    chain.spotFeeBps(),
    chain.nonceUsed("spot", maker, BigInt(q.nonceBucket), BigInt(q.nonce)),
    chain.balanceOf(q.makerToken as Address, maker),
    chain.allowance(q.makerToken as Address, maker, chain.settlementAddress()),
    (() => {
      const message = { ...q, makerAmount: BigInt(q.makerAmount), takerAmount: BigInt(q.takerAmount), expiry: BigInt(q.expiry), nonceBucket: BigInt(q.nonceBucket), nonce: BigInt(q.nonce) };
      const base = { domain: { name: "Cold Harbor", version: "1", chainId: cfg.CHAIN_ID, verifyingContract: chain.settlementAddress() }, types: SPOT_TYPES, primaryType: "Quote" as const, message };
      return signatureOk(ctx, "spot", maker, signature, () => recoverTypedDataAddress({ ...base, signature }), () => chain.client.verifyTypedData({ ...base, address: maker, signature }));
    })(),
  ]);
  if (q.feeBps !== fee) return no(`feeBps must equal the protocol fee (${fee})`);
  if (used) return no("nonce already used");
  const needed = BigInt(q.makerAmount);
  if (funds < needed) return no("maker balance is below the quoted amount");
  if (allowance < needed) return no("maker has not approved the settlement contract for the quoted amount");
  if (!sigValid) return no("signature is not valid for this quote");

  // Net price for the taker, fee included: buying pays the fee on top, selling has it deducted.
  const net = unitPrice(buy ? usdg + feeOf(usdg, fee) : usdg - feeOf(usdg, fee), base);
  return { ok: true, net };
}

export async function validateForward(ctx: Ctx, rfq: ForwardRfq, mmWallet: string, q: ForwardQuote, signature: Hex): Promise<Verdict> {
  const { cfg, chain } = ctx;
  if (!cfg.FW_ENGINE) return no("relay is not configured for forwards");
  if (!eq(q.rfqId, rfq.id)) return no("rfqId in the quote does not match");
  if (!eq(q.maker, mmWallet)) return no("maker must be the wallet registered to this API key");
  if (!eq(q.taker, rfq.taker)) return no("taker does not match the RFQ");
  if (!eq(q.stockToken, rfq.token)) return no("stockToken does not match the RFQ");
  if (q.side !== (rfq.side === "LONG" ? 0 : 1)) return no("side must be the taker's side");
  if (BigInt(q.qty) !== rfq.qty) return no("qty must equal the requested quantity");
  if (q.maturityCloseTs !== rfq.maturityCloseTs) return no("maturity must equal the requested maturity");
  const minIm = ETFS.has(rfq.ticker) ? 1000 : 2000;
  if (q.imBps < minIm || q.mmBps === 0 || q.mmBps >= q.imBps) return no(`margin terms invalid: imBps at least ${minIm}, mmBps between 1 and imBps - 1`);
  const strike = BigInt(q.strike);
  if (strike <= 0n) return no("strike must be greater than zero");
  const exp = expiryProblem(ctx, q.expiry);
  if (exp) return no(exp);

  const strikeUsd = Number(strike) / 1e8;
  const dev = deviationBps(strikeUsd, rfq.ref.mid);
  if (dev > cfg.MAX_DEV_BPS_FORWARD) return no(`strike is ${dev.toFixed(0)} bps from the reference, limit is ${cfg.MAX_DEV_BPS_FORWARD}`);

  const maker = q.maker as Address;
  const notional = (BigInt(q.qty) * strike) / 10n ** 20n;
  const im = (notional * BigInt(q.imBps)) / 10_000n;
  const [fee, limits, used, free, sigValid] = await Promise.all([
    chain.fwFeeBps(),
    chain.fwLimits(),
    chain.nonceUsed("forward", maker, BigInt(q.nonceBucket), BigInt(q.nonce)),
    chain.freeMargin(maker),
    (() => {
      const message = { ...q, qty: BigInt(q.qty), strike, maturityCloseTs: BigInt(q.maturityCloseTs), expiry: BigInt(q.expiry), nonceBucket: BigInt(q.nonceBucket), nonce: BigInt(q.nonce) };
      const base = { domain: { name: "Cold Harbor Forwards", version: "1", chainId: cfg.CHAIN_ID, verifyingContract: chain.engineAddress() }, types: FORWARD_TYPES, primaryType: "ForwardQuote" as const, message };
      return signatureOk(ctx, "forward", maker, signature, () => recoverTypedDataAddress({ ...base, signature }), () => chain.client.verifyTypedData({ ...base, address: maker, signature }));
    })(),
  ]);
  if (limits.paused) return no("forwards are paused");
  if (q.feeBps !== fee) return no(`feeBps must equal the opening fee (${fee})`);
  if (notional < limits.minNotional || notional > limits.maxNotional) return no("notional is outside the allowed range");
  if (used) return no("nonce already used");
  if (free < im) return no("maker free margin in the vault is below the initial margin");
  if (!sigValid) return no("signature is not valid for this quote");
  return { ok: true, net: strikeUsd };
}
