import { BaseError, ContractFunctionRevertedError, UserRejectedRequestError, parseAbi, type Address, type Hex } from "viem";

export const vaultAbi = parseAbi([
  "function deposit(uint256 amount)",
  "function withdraw(uint256 amount)",
  "function balanceOf(address) view returns (uint256)",
  "function lockedOf(address) view returns (uint256)",
  "function freeMargin(address) view returns (uint256)",
  "error InsufficientFree()",
  "error ZeroAmount()",
]);

export const calendarAbi = parseAbi([
  "function isOfficialClose(uint64 ts) view returns (bool)",
  "function regularCloseOf(uint256 dayIndex) view returns (uint64)",
]);

export const oracleAbi = parseAbi(["function referencePrice(address feed) view returns (uint256 price, bool live)"]);

/** TESTNET mock feed (src/mocks/TestnetFeed.sol). */
export const feedAbi = parseAbi([
  "function push(uint256 price)",
  "function pushAt(uint256 price, uint256 ts)",
  "function latestRoundData() view returns (uint80, int256, uint256, uint256, uint80)",
  "error MoveTooLarge()",
  "error BadTimestamp()",
  "error BadPrice()",
]);

const QUOTE =
  "(address maker, address taker, address stockToken, uint8 side, uint256 qty, uint256 strike, uint64 maturityCloseTs, uint16 imBps, uint16 mmBps, uint16 feeBps, uint64 expiry, uint64 nonceBucket, uint128 nonce, bytes32 rfqId)";
const POSITION =
  "(address maker, address taker, address stockToken, address feed, uint8 side, uint256 qty, uint256 strike, uint64 maturityCloseTs, uint256 makerMargin, uint256 takerMargin, uint16 mmBps, uint8 status, uint64 callDeadline, address callParty)";

export const engineAbi = parseAbi([
  `function openForward(${QUOTE} q, bytes makerSig) returns (uint256 id)`,
  "function topUp(uint256 id, uint256 amount)",
  "function flagMarginCall(uint256 id)",
  "function liquidate(uint256 id)",
  "function settle(uint256 id)",
  "function closeByMutual(uint256 id, uint256 price, bytes makerSig, bytes takerSig)",
  "function hashClose(uint256 id, uint256 price) view returns (bytes32)",
  `function getPosition(uint256 id) view returns (${POSITION})`,
  "function markToMarket(uint256 id) view returns (int256 pnlTaker, uint256 equityTaker, uint256 equityMaker, uint256 price, bool live)",
  "function requiredMargin(uint256 id) view returns (uint256)",
  "function openFeeBps() view returns (uint16)",
  "function paused() view returns (bool)",
  "event ForwardOpened(uint256 indexed id, bytes32 indexed rfqId, address indexed maker, address taker, address stockToken, uint8 side, uint256 qty, uint256 strike, uint64 maturityCloseTs, uint256 makerMargin, uint256 takerMargin)",
  "event ObservationDeferred(uint256 indexed id, uint64 closeTs)",
  "event ForwardSettled(uint256 indexed id, uint256 closePrice, int256 pnlTaker)",
  "error NotTaker()",
  "error QuoteExpired()",
  "error SameParty()",
  "error UnderlyingNotActive()",
  "error InvalidTerms()",
  "error FeeMismatch()",
  "error NotOfficialClose()",
  "error TenorOutOfRange()",
  "error NotionalOutOfRange()",
  "error NonceAlreadyUsed()",
  "error InvalidSignature()",
  "error NotOpen()",
  "error NotParty()",
  "error NotLiquidatable()",
  "error NoMarginCall()",
  "error TopUpWindowOpen()",
  "error PriceNotLive()",
  "error OraclePausedByToken()",
  "error InsufficientFree()",
  "error EnforcedPause()",
  "error TooEarly()",
]);

export const FW_ERRORS: Record<string, string> = {
  NotTaker: "This quote belongs to a different wallet.",
  QuoteExpired: "The quote expired before it was confirmed. Request a new one.",
  SameParty: "Maker and taker are the same address.",
  UnderlyingNotActive: "This market is not enabled for forwards.",
  InvalidTerms: "The maker's margin terms are not valid for this market.",
  FeeMismatch: "The opening fee changed after the quote was signed. Request a new one.",
  NotOfficialClose: "That date is not an official market close (weekend or holiday).",
  TenorOutOfRange: "Maturity must be between 7 days and 3 months from now.",
  NotionalOutOfRange: "Notional is outside the allowed range.",
  NonceAlreadyUsed: "This quote was already used or cancelled.",
  InvalidSignature: "The maker's signature is not valid for this quote.",
  NotOpen: "This forward is no longer open.",
  NotParty: "Only the maker or taker of this forward can do that.",
  NotLiquidatable: "Both sides are above maintenance margin at the current price.",
  NoMarginCall: "No margin call has been raised on this forward.",
  TopUpWindowOpen: "The top-up window is still open.",
  PriceNotLive: "The price feed is stale. Refresh the testnet mock price first.",
  OraclePausedByToken: "The token reports a corporate action. Try again later.",
  InsufficientFree: "Not enough free margin in the vault. Deposit more first.",
  EnforcedPause: "Forwards are paused.",
  TooEarly: "Too early: settlement opens 5 minutes after the close.",
  MoveTooLarge: "The mock feed accepts at most a 10% move per update.",
  BadTimestamp: "A later price was already recorded on the mock feed, so a close price can no longer be back-dated.",
};

export function explain(e: unknown): string {
  if (e instanceof BaseError) {
    if (e.walk((x) => x instanceof UserRejectedRequestError)) return "Rejected in the wallet.";
    const r = e.walk((x) => x instanceof ContractFunctionRevertedError) as ContractFunctionRevertedError | null;
    const name = r?.data?.errorName;
    if (name) return FW_ERRORS[name] ?? name;
    return e.shortMessage;
  }
  return (e as Error).message ?? "Transaction failed.";
}

export type FwSide = "LONG" | "SHORT"; // the TAKER's side. The maker holds the opposite.

/** Quote as it travels over the wire (bigints as strings). Matches ForwardEngine.ForwardQuote. */
export type WireForwardQuote = {
  maker: Address;
  taker: Address;
  stockToken: Address;
  side: 0 | 1;
  qty: string;
  strike: string; // 8 decimals
  maturityCloseTs: number;
  imBps: number;
  mmBps: number;
  feeBps: number;
  expiry: number;
  nonceBucket: string;
  nonce: string;
  rfqId: Hex;
};

export type ForwardMakerQuote = { id: string; makerName: string; quote: WireForwardQuote; signature: Hex; latencyMs: number };

export type ForwardRfqResponse = {
  rfqId: Hex;
  issuedAt: number;
  ref: { mid: number; generatedAt: string };
  simulated: boolean;
  quotes: ForwardMakerQuote[];
};

export const toContractForwardQuote = (w: WireForwardQuote) => ({
  ...w,
  qty: BigInt(w.qty),
  strike: BigInt(w.strike),
  maturityCloseTs: BigInt(w.maturityCloseTs),
  expiry: BigInt(w.expiry),
  nonceBucket: BigInt(w.nonceBucket),
  nonce: BigInt(w.nonce),
});

/** qty (18 dp) * price (8 dp) -> USDG (6 dp). Same integer math as the contract. */
export const notionalOf = (qty: bigint, price8: bigint) => (qty * price8) / 10n ** 20n;

export const STATUS = ["None", "Open", "Settled", "Liquidated", "Closed"] as const;
export const SETTLE_GRACE_S = 300;

/** EIP-712 type for an early, mutually agreed unwind price. Matches ForwardEngine.CLOSE_TYPEHASH. */
export const CLOSE_TYPES = { Close: [{ name: "id", type: "uint256" }, { name: "price", type: "uint256" }] } as const;
export const closeDomain = (chainId: number, engine: Address) => ({ name: "Cold Harbor Forwards", version: "1", chainId, verifyingContract: engine }) as const;
