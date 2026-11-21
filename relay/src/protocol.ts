import { z } from "zod";

// Runtime check is the regex. The cast only gives the parsed value viem's `0x${string}` type.
const addr = z.string().regex(/^0x[0-9a-fA-F]{40}$/) as unknown as z.ZodType<`0x${string}`>;
const uint = z.string().regex(/^\d{1,78}$/);
const bytes32 = z.string().regex(/^0x[0-9a-fA-F]{64}$/) as unknown as z.ZodType<`0x${string}`>;
const sig = z.string().regex(/^0x[0-9a-fA-F]{128,132}$/);

/** What a taker sends to POST /rfq. */
export const rfqInput = z.discriminatedUnion("product", [
  z.object({ product: z.literal("spot"), ticker: z.string().max(10), side: z.enum(["BUY", "SELL"]), baseAmount: uint, taker: addr }).strict(),
  z.object({ product: z.literal("forward"), ticker: z.string().max(10), side: z.enum(["LONG", "SHORT"]), qty: uint, maturityCloseTs: z.number().int(), taker: addr }).strict(),
]);
export type RfqInput = z.infer<typeof rfqInput>;

export const spotQuote = z
  .object({
    maker: addr, taker: addr, makerToken: addr, takerToken: addr, makerAmount: uint, takerAmount: uint,
    expiry: z.number().int(), nonceBucket: uint, nonce: uint, feeBps: z.number().int().min(0).max(10_000), rfqId: bytes32,
  })
  .strict();
export type SpotQuote = z.infer<typeof spotQuote>;

export const forwardQuote = z
  .object({
    maker: addr, taker: addr, stockToken: addr, side: z.union([z.literal(0), z.literal(1)]), qty: uint, strike: uint,
    maturityCloseTs: z.number().int(), imBps: z.number().int().min(0).max(10_000), mmBps: z.number().int().min(0).max(10_000),
    feeBps: z.number().int().min(0).max(10_000), expiry: z.number().int(), nonceBucket: uint, nonce: uint, rfqId: bytes32,
  })
  .strict();
export type ForwardQuote = z.infer<typeof forwardQuote>;

/** MM -> relay. `quote` is parsed again against the RFQ's product once the RFQ is known. */
export const quoteSubmit = z.object({ type: z.literal("quote.submit"), rfqId: bytes32, quote: z.record(z.string(), z.unknown()), signature: sig }).strict();
export const clientMessage = z.discriminatedUnion("type", [quoteSubmit, z.object({ type: z.literal("ping") }).strict()]);

export const BASE_DECIMALS = 18;
export const USDG_DECIMALS = 6;
