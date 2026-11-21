import { createPublicClient, http, parseAbi, type Address, type PublicClient } from "viem";
import type { Config } from "./config.js";

const erc20 = parseAbi(["function balanceOf(address) view returns (uint256)", "function allowance(address,address) view returns (uint256)"]);
const settlementAbi = parseAbi([
  "function feeBps() view returns (uint16)",
  "function paused() view returns (bool)",
  "function tokenAllowed(address) view returns (bool)",
  "function isSigner(address maker, address signer) view returns (bool)",
  "function isNonceUsed(address maker, uint64 bucket, uint128 nonce) view returns (bool)",
]);
const engineAbi = parseAbi([
  "function openFeeBps() view returns (uint16)",
  "function paused() view returns (bool)",
  "function minTenor() view returns (uint64)",
  "function maxTenor() view returns (uint64)",
  "function minNotional() view returns (uint256)",
  "function maxNotional() view returns (uint256)",
  "function isSigner(address maker, address signer) view returns (bool)",
  "function isNonceUsed(address maker, uint64 bucket, uint128 nonce) view returns (bool)",
  "function getPosition(uint256 id) view returns ((address maker, address taker, address stockToken, address feed, uint8 side, uint256 qty, uint256 strike, uint64 maturityCloseTs, uint256 makerMargin, uint256 takerMargin, uint16 mmBps, uint8 status, uint64 callDeadline, address callParty))",
]);
const vaultAbi = parseAbi(["function freeMargin(address) view returns (uint256)"]);
const calendarAbi = parseAbi(["function isOfficialClose(uint64 ts) view returns (bool)"]);

/** Cache for slow-changing on-chain parameters, so a burst of quotes does not become a burst of RPC calls. */
function memo<T>(ttlMs: number, fn: () => Promise<T>): () => Promise<T> {
  let at = 0;
  let val: T;
  return async () => {
    if (Date.now() - at > ttlMs) {
      val = await fn();
      at = Date.now();
    }
    return val;
  };
}

export type Chain = ReturnType<typeof makeChain>;

export function makeChain(cfg: Config) {
  const client: PublicClient = createPublicClient({ transport: http(cfg.RPC_URL, { timeout: 8_000, retryCount: 1 }) });
  const need = <T,>(v: T | undefined, name: string): T => {
    if (v === undefined) throw new Error(`${name} is not configured`);
    return v;
  };
  const settlement = () => need(cfg.SETTLEMENT as Address | undefined, "SETTLEMENT");
  const engine = () => need(cfg.FW_ENGINE as Address | undefined, "FW_ENGINE");

  const spotFeeBps = memo(15_000, async () => Number(await client.readContract({ address: settlement(), abi: settlementAbi, functionName: "feeBps" })));
  const spotPaused = memo(15_000, () => client.readContract({ address: settlement(), abi: settlementAbi, functionName: "paused" }));
  const fwFeeBps = memo(15_000, async () => Number(await client.readContract({ address: engine(), abi: engineAbi, functionName: "openFeeBps" })));
  const fwLimits = memo(15_000, async () => {
    const [minTenor, maxTenor, minNotional, maxNotional, paused] = await Promise.all([
      client.readContract({ address: engine(), abi: engineAbi, functionName: "minTenor" }),
      client.readContract({ address: engine(), abi: engineAbi, functionName: "maxTenor" }),
      client.readContract({ address: engine(), abi: engineAbi, functionName: "minNotional" }),
      client.readContract({ address: engine(), abi: engineAbi, functionName: "maxNotional" }),
      client.readContract({ address: engine(), abi: engineAbi, functionName: "paused" }),
    ]);
    return { minTenor: Number(minTenor), maxTenor: Number(maxTenor), minNotional, maxNotional, paused };
  });

  return {
    client,
    spotFeeBps,
    spotPaused,
    fwFeeBps,
    fwLimits,
    tokenAllowed: (t: Address) => client.readContract({ address: settlement(), abi: settlementAbi, functionName: "tokenAllowed", args: [t] }),
    isOfficialClose: (ts: number) =>
      client.readContract({ address: need(cfg.FW_CALENDAR as Address | undefined, "FW_CALENDAR"), abi: calendarAbi, functionName: "isOfficialClose", args: [BigInt(ts)] }),
    isSigner: (product: "spot" | "forward", maker: Address, signer: Address) =>
      client.readContract({ address: product === "spot" ? settlement() : engine(), abi: product === "spot" ? settlementAbi : engineAbi, functionName: "isSigner", args: [maker, signer] }),
    nonceUsed: (product: "spot" | "forward", maker: Address, bucket: bigint, nonce: bigint) =>
      client.readContract({ address: product === "spot" ? settlement() : engine(), abi: product === "spot" ? settlementAbi : engineAbi, functionName: "isNonceUsed", args: [maker, bucket, nonce] }),
    balanceOf: (token: Address, who: Address) => client.readContract({ address: token, abi: erc20, functionName: "balanceOf", args: [who] }),
    allowance: (token: Address, owner: Address, spender: Address) => client.readContract({ address: token, abi: erc20, functionName: "allowance", args: [owner, spender] }),
    freeMargin: (who: Address) => client.readContract({ address: need(cfg.FW_VAULT as Address | undefined, "FW_VAULT"), abi: vaultAbi, functionName: "freeMargin", args: [who] }),
    settlementAddress: settlement,
    engineAddress: engine,
    getPosition: (id: bigint) => client.readContract({ address: engine(), abi: engineAbi, functionName: "getPosition", args: [id] }),
  };
}
