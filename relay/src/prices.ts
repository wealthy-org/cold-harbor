// Robinhood Stock Token REST prices (token-level, multiplier-adjusted). Rate limit 60 rps, so cache briefly.
export type RefPrice = { symbol: string; bid: number; ask: number; mid: number; stopped: boolean; generatedAt: string };

let memo: { at: number; data: Record<string, RefPrice> } | null = null;

export async function fetchPrices(): Promise<Record<string, RefPrice>> {
  if (memo && Date.now() - memo.at < 3_000) return memo.data;
  const res = await fetch("https://api.robinhood.com/rhj/prices", { signal: AbortSignal.timeout(6_000) });
  if (!res.ok) throw new Error(`reference prices ${res.status}`);
  const { quotes } = (await res.json()) as { quotes?: { tokenSymbol?: string; tokenBid?: string; tokenAsk?: string; isTradingHalt?: boolean; generatedAt?: string }[] };
  const out: Record<string, RefPrice> = {};
  for (const q of quotes ?? []) {
    const bid = Number(q.tokenBid);
    const ask = Number(q.tokenAsk);
    if (!q.tokenSymbol || !Number.isFinite(bid) || !Number.isFinite(ask) || bid <= 0 || ask <= 0) continue;
    out[q.tokenSymbol] = { symbol: q.tokenSymbol, bid, ask, mid: (bid + ask) / 2, stopped: Boolean(q.isTradingHalt), generatedAt: q.generatedAt ?? "" };
  }
  memo = { at: Date.now(), data: out };
  return out;
}
