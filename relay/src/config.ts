import { z } from "zod";

const addr = z.string().regex(/^0x[0-9a-fA-F]{40}$/, "must be a 0x address").optional();
const jsonMap = z
  .string()
  .default("{}")
  .transform((s, ctx) => {
    try {
      const v = JSON.parse(s) as Record<string, string>;
      return Object.fromEntries(Object.entries(v).filter(([, a]) => /^0x[0-9a-fA-F]{40}$/.test(a))) as Record<string, `0x${string}`>;
    } catch {
      ctx.addIssue({ code: "custom", message: "must be valid JSON" });
      return z.NEVER;
    }
  });

const schema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  CHAIN_ID: z.coerce.number().default(46630),
  RPC_URL: z.string().url().default("https://rpc.testnet.chain.robinhood.com"),
  PORT: z.coerce.number().default(8080),
  ALLOWED_ORIGINS: z.string().default("http://localhost:3005"),
  // Contracts and tokens (from contracts/deployments/*.json)
  SETTLEMENT: addr,
  USDG: addr,
  FW_ENGINE: addr,
  FW_VAULT: addr,
  FW_CALENDAR: addr,
  FW_ORACLE: addr,
  TOKENS: jsonMap,
  FW_FEEDS: jsonMap,
  // First block the indexer reads (testnet: just before the first deploy). Set to the deploy block on a new network.
  INDEX_FROM_BLOCK: z.coerce.number().int().default(156187000),
  // RFQ rules (dev brief section 8)
  QUOTE_DEADLINE_MS: z.coerce.number().int().min(200).max(10_000).default(1500),
  MIN_EXPIRY_SEC: z.coerce.number().int().min(5).default(20),
  MAX_EXPIRY_SEC: z.coerce.number().int().max(300).default(60),
  MAX_DEV_BPS_SPOT: z.coerce.number().int().default(150),
  MAX_DEV_BPS_FORWARD: z.coerce.number().int().default(1200),
  RFQ_PER_MIN_PER_IP: z.coerce.number().int().default(20),
});

export type Config = z.infer<typeof schema> & { origins: string[] };

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  // Local development: read ./.env if present. On Railway there is no file and the dashboard variables are used.
  try {
    process.loadEnvFile();
  } catch {
    /* no .env file */
  }
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    // Field names only, never values (DATABASE_URL carries the password).
    throw new Error("Invalid configuration: " + parsed.error.issues.map((i) => i.path.join(".") + " " + i.message).join("; "));
  }
  if (parsed.data.CHAIN_ID === 4663) throw new Error("This relay build refuses mainnet (chain 4663).");
  return { ...parsed.data, origins: parsed.data.ALLOWED_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean) };
}

/** ETFs get the lower initial margin (dev brief 7.3). */
export const ETFS = new Set(["SPY", "QQQ", "GLD", "SLV", "SGOV", "EWY", "USO"]);
