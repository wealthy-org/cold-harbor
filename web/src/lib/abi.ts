import { parseAbi } from "viem";

export const erc20Abi = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)",
]);

/** Testnet FaucetToken only: public mint. Does not exist on the real stock tokens. */
export const faucetAbi = parseAbi(["function mint(address to, uint256 amount)"]);

export const settlementAbi = parseAbi([
  "function fillQuote((address maker, address taker, address makerToken, address takerToken, uint256 makerAmount, uint256 takerAmount, uint64 expiry, uint64 nonceBucket, uint128 nonce, uint16 feeBps, bytes32 rfqId) q, bytes makerSig)",
  "function feeBps() view returns (uint16)",
  "function paused() view returns (bool)",
  "event QuoteFilled(bytes32 indexed rfqId, address indexed maker, address indexed taker, address makerToken, address takerToken, uint256 makerAmount, uint256 takerAmount, uint256 fee)",
  "error QuoteExpired()",
  "error NotTaker()",
  "error NonceAlreadyUsed()",
  "error InvalidSignature()",
  "error TokenNotAllowed(address token)",
  "error NotUsdgPair()",
  "error ZeroAmount()",
  "error SameParty()",
  "error FeeMismatch()",
  "error EnforcedPause()",
]);

/** Human messages for contract reverts. */
export const REVERT_MESSAGES: Record<string, string> = {
  QuoteExpired: "The quote expired before it was confirmed. Request a new one.",
  NonceAlreadyUsed: "This quote was already filled or cancelled.",
  InvalidSignature: "The maker's signature is not valid for this quote.",
  TokenNotAllowed: "This token is not enabled on the settlement contract.",
  FeeMismatch: "The protocol fee changed after the quote was signed. Request a new one.",
  EnforcedPause: "Settlement is paused.",
  NotTaker: "This quote belongs to a different wallet.",
  NotUsdgPair: "This pair is not supported.",
  ZeroAmount: "Amount must be greater than zero.",
  SameParty: "Maker and taker are the same address.",
};
