import { defineChain, type Address } from "viem";

// Network config. Defaults to Robinhood Chain testnet. Override with NEXT_PUBLIC_* for local anvil.
export const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 46630);
export const IS_MAINNET = CHAIN_ID === 4663;

const PUBLIC_RPC: Record<number, string> = {
  4663: "https://rpc.mainnet.chain.robinhood.com",
  46630: "https://rpc.testnet.chain.robinhood.com",
};
export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL ?? PUBLIC_RPC[CHAIN_ID] ?? "http://127.0.0.1:8545";

export const EXPLORER: string | undefined =
  CHAIN_ID === 4663
    ? "https://robinhoodchain.blockscout.com"
    : CHAIN_ID === 46630
      ? "https://explorer.testnet.chain.robinhood.com"
      : undefined;

export const CHAIN_NAME =
  CHAIN_ID === 4663 ? "Robinhood Chain" : CHAIN_ID === 46630 ? "Robinhood Chain Testnet" : `Local chain ${CHAIN_ID}`;

export const chain = defineChain({
  id: CHAIN_ID,
  name: CHAIN_NAME,
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
  ...(EXPLORER ? { blockExplorers: { default: { name: "Explorer", url: EXPLORER } } } : {}),
});

const addr = (v?: string) => (v && /^0x[0-9a-fA-F]{40}$/.test(v) ? (v as Address) : undefined);

export const SETTLEMENT = addr(process.env.NEXT_PUBLIC_SETTLEMENT);
export const USDG = addr(process.env.NEXT_PUBLIC_USDG);
export const FEE_BPS = Number(process.env.NEXT_PUBLIC_FEE_BPS ?? 8);

function parseTokens(): Record<string, Address> {
  try {
    const raw = JSON.parse(process.env.NEXT_PUBLIC_TOKENS ?? "{}") as Record<string, string>;
    return Object.fromEntries(Object.entries(raw).flatMap(([k, v]) => (addr(v) ? [[k, addr(v) as Address]] : [])));
  } catch {
    return {};
  }
}
/** ticker -> stock token address on THIS network. Must come from the official Robinhood registry in production. */
export const TOKENS = parseTokens();

export const STOCK_DECIMALS = 18;
export const USDG_DECIMALS = 6;

export const DEPLOYED = Boolean(SETTLEMENT && USDG);

// Forward stack (ForwardEngine, MarginVault, OracleAdapter, MarketCalendar). Optional: forwards stay a preview without it.
function parseFeeds(): Record<string, Address> {
  try {
    const raw = JSON.parse(process.env.NEXT_PUBLIC_FW_FEEDS ?? "{}") as Record<string, string>;
    return Object.fromEntries(Object.entries(raw).flatMap(([k, v]) => (addr(v) ? [[k, addr(v) as Address]] : [])));
  } catch {
    return {};
  }
}
export const FW_ENGINE = addr(process.env.NEXT_PUBLIC_FW_ENGINE);
export const FW_VAULT = addr(process.env.NEXT_PUBLIC_FW_VAULT);
export const FW_ORACLE = addr(process.env.NEXT_PUBLIC_FW_ORACLE);
export const FW_CALENDAR = addr(process.env.NEXT_PUBLIC_FW_CALENDAR);
/** ticker -> TESTNET mock price feed (anyone can push). Mainnet uses Chainlink, so this is empty there. */
export const FW_FEEDS: Record<string, Address> = parseFeeds();
export const FW_FROM_BLOCK = BigInt(process.env.NEXT_PUBLIC_FW_FROM_BLOCK ?? "0");
export const FW_DEPLOYED = Boolean(FW_ENGINE && FW_VAULT && FW_ORACLE && FW_CALENDAR && USDG);

/** Relay base URL. Quotes require it; there is no local fallback. */
export const RELAY_URL = (process.env.NEXT_PUBLIC_RELAY_URL ?? "").replace(/\/$/, "");
/** Whether the quote relay is configured on this deploy. Never true without a real relay URL, so this never implies "simulated" — call `rfq.simulated` for that, it reflects who actually answered. */
export const QUOTES_ENABLED = Boolean(RELAY_URL);
export const rfqEndpoint = () => `${RELAY_URL}/rfq`;
export const rfqBody = <T extends object>(product: "spot" | "forward", body: T) => JSON.stringify({ product, ...body });
export const closeProposalEndpoint = (forwardId: bigint | string) => `${RELAY_URL}/forwards/${forwardId}/close-proposal`;
