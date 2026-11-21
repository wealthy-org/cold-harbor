// Keeper daemon (dev brief sections 6.2 and 12): calls the public settle/flagMarginCall/liquidate
// functions on ForwardEngine so open forwards do not sit waiting for someone to remember to call them.
// TESTNET ONLY: uses a throwaway funded key (same one used by the e2e scripts), never a real deployer key.
// settle/flagMarginCall/liquidate are permissionless on-chain (anyone may call them) by design, so this
// script needs no special privilege -- just gas. For mainnet this should be replaced by a managed keeper
// network (Chainlink Automation / Gelato) and/or a small on-chain reward to attract third-party keepers,
// so the protocol never has to hand out a funded private key to run automation. See skill notes.
import { readFileSync } from "node:fs";
import { createPublicClient, createWalletClient, http, parseAbi, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { loadConfig } from "../src/config.js";
import { connect } from "../src/db.js";

const cfg = loadConfig();
const db = connect(cfg.DATABASE_URL);

const keyFile = process.env.KEEPER_KEY_FILE ?? "../contracts/.secrets/test-taker.env";
const kv = Object.fromEntries(
  readFileSync(keyFile, "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => l.split("=") as [string, string])
);
const account = privateKeyToAccount(kv.TAKER_PK as `0x${string}`);
const chain = {
  id: cfg.CHAIN_ID,
  name: "robinhood-testnet",
  nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [cfg.RPC_URL] } },
} as const;
const wallet = createWalletClient({ account, chain, transport: http(cfg.RPC_URL) });
const pub = createPublicClient({ chain, transport: http(cfg.RPC_URL) });

const engineAbi = parseAbi([
  "function settle(uint256 id)",
  "function flagMarginCall(uint256 id)",
  "function liquidate(uint256 id)",
  "function getPosition(uint256 id) view returns ((address maker,address taker,address stockToken,address feed,uint8 side,uint256 qty,uint256 strike,uint64 maturityCloseTs,uint256 makerMargin,uint256 takerMargin,uint16 mmBps,uint8 status,uint64 callDeadline,address callParty))",
  "function markToMarket(uint256 id) view returns (int256 pnlTaker, uint256 equityTaker, uint256 equityMaker, uint256 price, bool live)",
  "function requiredMargin(uint256 id) view returns (uint256)",
]);

const ENGINE_ = cfg.FW_ENGINE as Address | undefined;
if (!ENGINE_) throw new Error("FW_ENGINE is not configured; keeper has nothing to watch.");
const ENGINE: Address = ENGINE_;

async function send(fn: "settle" | "flagMarginCall" | "liquidate", id: bigint) {
  const { request } = await pub.simulateContract({ address: ENGINE, abi: engineAbi, functionName: fn, args: [id], account });
  const hash = await wallet.writeContract(request);
  console.log(`keeper: ${fn}(${id}) -> ${hash}`);
  await pub.waitForTransactionReceipt({ hash }).catch(() => {});
  return hash;
}

async function tick() {
  const open = await db.query(`SELECT id FROM forwards WHERE status = 'open' ORDER BY id`);
  for (const row of open.rows as { id: string }[]) {
    const id = BigInt(row.id);
    try {
      const pos = await pub.readContract({ address: ENGINE, abi: engineAbi, functionName: "getPosition", args: [id] });
      if (pos.status !== 1) continue; // 1 = Open; DB may lag the indexer by a few seconds

      const now = BigInt(Math.floor(Date.now() / 1000));
      if (now >= pos.maturityCloseTs + 300n) {
        // past the official close plus the oracle's close grace: try to settle (a no-op if still deferred)
        await send("settle", id);
        continue;
      }

      if (pos.callDeadline !== 0n) {
        if (now > pos.callDeadline) await send("liquidate", id);
        continue;
      }

      const [, equityTaker, equityMaker] = await pub.readContract({ address: ENGINE, abi: engineAbi, functionName: "markToMarket", args: [id] });
      const req = await pub.readContract({ address: ENGINE, abi: engineAbi, functionName: "requiredMargin", args: [id] });
      if (equityTaker < req || equityMaker < req) await send("flagMarginCall", id);
    } catch (e) {
      console.error(`keeper: forward ${id} failed:`, e instanceof Error ? e.message.slice(0, 200) : e);
    }
  }
}

console.log(`keeper: watching ${ENGINE} on chain ${cfg.CHAIN_ID} as ${account.address} (throwaway testnet key)`);
void tick();
setInterval(() => void tick(), 30_000);
