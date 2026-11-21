// Server-side only. Robinhood Stock Token REST prices (token-level, multiplier-adjusted).
// https://docs.robinhood.com/chain/stock-token-apis/  (rate limit 60 rps, so we proxy and cache briefly)
export type RefPrice = { symbol: string; bid: number; ask: number; mid: number; stopped: boolean; generatedAt: string };

type Raw = { tokenSymbol: string; tokenBid?: string; tokenAsk?: string; isTradingHalt?: boolean; generatedAt?: string };

let memo: { at: number; data: Record<string, RefPrice> } | null = null;
const TTL_MS = 3_000; // upstream is rate limited (60 rps) and cached, so one fetch per few seconds is plenty

export async function fetchPrices(): Promise<Record<string, RefPrice>> {
  if (memo && Date.now() - memo.at < TTL_MS) return memo.data;
  const res = await fetch("https://api.robinhood.com/rhj/prices", { cache: "no-store" });
  if (!res.ok) throw new Error(`prices ${res.status}`);
  const { quotes } = (await res.json()) as { quotes: Raw[] };
  const out: Record<string, RefPrice> = {};
  for (const q of quotes ?? []) {
    const bid = Number(q.tokenBid);
    const ask = Number(q.tokenAsk);
    if (!q.tokenSymbol || !Number.isFinite(bid) || !Number.isFinite(ask) || bid <= 0 || ask <= 0) continue;
    out[q.tokenSymbol] = {
      symbol: q.tokenSymbol,
      bid,
      ask,
      mid: (bid + ask) / 2,
      stopped: Boolean(q.isTradingHalt),
      generatedAt: q.generatedAt ?? "",
    };
  }
  memo = { at: Date.now(), data: out };
  return out;
}
