"use client";

import { useEffect, useState } from "react";

export type Ref = { bid: number; ask: number; mid: number; stopped: boolean; generatedAt: string };

/** Polls the server proxy for real Robinhood token bid/ask. */
export function useRefPrices(intervalMs = 10_000) {
  const [prices, setPrices] = useState<Record<string, Ref>>({});
  const [error, setError] = useState<string | null>(null);
  const [loadedAt, setLoadedAt] = useState<number | null>(null);

  useEffect(() => {
    let dead = false;
    const load = async () => {
      try {
        const r = await fetch("/api/prices", { cache: "no-store" });
        const j = (await r.json()) as { prices?: Record<string, Ref>; error?: string };
        if (dead) return;
        if (!r.ok || !j.prices) throw new Error(j.error ?? "Price feed unavailable");
        setPrices(j.prices);
        setError(null);
        setLoadedAt(Date.now());
      } catch (e) {
        if (!dead) setError((e as Error).message);
      }
    };
    void load();
    const t = setInterval(load, intervalMs);
    return () => {
      dead = true;
      clearInterval(t);
    };
  }, [intervalMs]);

  return { prices, error, loadedAt };
}

/** Ticking clock for countdowns. Only runs while `active`. */
export function useNow(active: boolean, stepMs = 100) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!active) return;
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const t = setInterval(tick, stepMs);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [active, stepMs]);
  return now;
}
