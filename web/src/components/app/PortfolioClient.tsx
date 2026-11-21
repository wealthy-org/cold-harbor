"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Address, Hash } from "viem";
import Monogram from "@/components/Monogram";
import { erc20Abi } from "@/lib/abi";
import { CHAIN_ID, CHAIN_NAME, EXPLORER, STOCK_DECIMALS, TOKENS, USDG, USDG_DECIMALS } from "@/lib/chain";
import { fmtUnits, fmtUsd, shortAddr } from "@/lib/quote";
import ForwardPositions from "./ForwardPositions";
import { useRefPrices } from "./hooks";
import { publicClient, useWallet } from "./WalletProvider";

type Fill = { t: number; ticker: string; side: "BUY" | "SELL"; stock: string; usdg: string; price: number; fee: string; hash: Hash };
const PANEL = "border border-ink-700 bg-ink-900";
const trim = (s: string) => (s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s);

export default function PortfolioClient() {
  const { account } = useWallet();
  const { prices } = useRefPrices();
  const [balances, setBalances] = useState<Record<string, bigint>>({});
  const [usdg, setUsdg] = useState<bigint | null>(null);
  const [fills, setFills] = useState<Fill[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!account) return;
    let dead = false;
    (async () => {
      try {
        const entries = Object.entries(TOKENS) as [string, Address][];
        const [u, ...rest] = await Promise.all([
          USDG ? publicClient.readContract({ address: USDG, abi: erc20Abi, functionName: "balanceOf", args: [account] }) : Promise.resolve(0n),
          ...entries.map(([, a]) => publicClient.readContract({ address: a, abi: erc20Abi, functionName: "balanceOf", args: [account] })),
        ]);
        if (dead) return;
        setUsdg(u);
        setBalances(Object.fromEntries(entries.map(([t], i) => [t, rest[i]])));
        setError(null);
      } catch (e) {
        if (!dead) setError((e as Error).message.split("\n")[0]);
      }
    })();
    let list: Fill[] = [];
    try {
      list = JSON.parse(localStorage.getItem(`ch.fills.${CHAIN_ID}.${account.toLowerCase()}`) ?? "[]") as Fill[];
    } catch {
      /* ignore */
    }
    queueMicrotask(() => !dead && setFills(list));
    return () => {
      dead = true;
    };
  }, [account]);

  const holdings = useMemo(
    () =>
      Object.entries(balances)
        .filter(([, v]) => v > 0n)
        .map(([t, v]) => {
          const px = prices[t]?.mid;
          const qty = Number(v / 10n ** 10n) / 1e8;
          return { t, v, px, value: px ? qty * px : null };
        })
        .sort((a, b) => (b.value ?? 0) - (a.value ?? 0)),
    [balances, prices],
  );
  const stockValue = holdings.reduce((s, h) => s + (h.value ?? 0), 0);
  const cash = usdg !== null ? Number(usdg) / 10 ** USDG_DECIMALS : 0;
  const volume = fills.reduce((s, f) => s + Number(f.usdg) / 1e6, 0);
  const fees = fills.reduce((s, f) => s + Number(f.fee) / 1e6, 0);

  const stats: [string, string][] = [
    ["Total value", `$${fmtUsd(cash + stockValue)}`],
    ["USDG", fmtUsd(cash)],
    ["Stock tokens", `$${fmtUsd(stockValue)}`],
    ["Volume traded", `$${fmtUsd(volume)}`],
  ];

  return (
    <main className="mx-auto max-w-[1440px] px-8 pb-24 pt-10">
      <p className="mono-label mb-3">Portfolio</p>
      <h1 className="mb-8 text-4xl font-semibold tracking-[-0.02em]">Holdings and fills</h1>

      {!account ? (
        <div className={`${PANEL} p-10`}>
          <p className="text-lg">Connect a wallet to see your balances and fills on {CHAIN_NAME}.</p>
          <button onClick={() => window.dispatchEvent(new Event("ch:connect"))} className="mt-6 h-12 rounded-full bg-signal-500 px-7 text-[15px] font-medium text-ink-950 hover:bg-signal-300">
            Connect wallet
          </button>
        </div>
      ) : (
        <>
          <dl className="grid grid-cols-4 gap-px bg-ink-700">
            {stats.map(([l, v]) => (
              <div key={l} className="bg-ink-900 p-6">
                <dt className="mono-label mb-4">{l}</dt>
                <dd className="font-mono text-3xl font-medium tracking-tight">{v}</dd>
              </div>
            ))}
          </dl>
          {error && <p className="mt-4 text-sm text-neg-500">Could not read balances: {error}</p>}
          {Object.keys(TOKENS).length === 0 && (
            <p className="mt-4 text-sm text-slate-500">No stock token addresses are configured for {CHAIN_NAME}, so only fills are shown.</p>
          )}

          <div className="mt-10 grid grid-cols-12 gap-6">
            <section className={`${PANEL} col-span-5 self-start`}>
              <p className="mono-label border-b border-ink-700 px-6 py-4 !text-mist-100">Holdings</p>
              {holdings.length === 0 ? (
                <p className="px-6 py-10 text-sm text-slate-500">No stock tokens in this wallet.</p>
              ) : (
                holdings.map((h) => (
                  <div key={h.t} className="flex items-center justify-between border-b border-ink-700 px-6 py-4 last:border-b-0 hover:bg-ink-800">
                    <span className="flex items-center gap-3 font-mono"><Monogram t={h.t} size={28} />{h.t}</span>
                    <span className="text-right">
                      <span className="block font-mono">{trim(fmtUnits(h.v, STOCK_DECIMALS, 4))}</span>
                      <span className="block font-mono text-xs text-slate-500">{h.value !== null ? `$${fmtUsd(h.value)}` : "no price"}</span>
                    </span>
                  </div>
                ))
              )}
            </section>

            <section className={`${PANEL} col-span-7`}>
              <div className="flex items-center justify-between border-b border-ink-700 px-6 py-4">
                <p className="mono-label !text-mist-100">Fills</p>
                <p className="mono-label">{fills.length} · fees paid ${fmtUsd(fees)} · this browser</p>
              </div>
              <div className="mono-label grid grid-cols-12 gap-3 border-b border-ink-700 px-6 py-3">
                <span className="col-span-3">Time</span><span className="col-span-2">Market</span><span className="col-span-1">Side</span>
                <span className="col-span-2 text-right">Price</span><span className="col-span-2 text-right">USDG</span><span className="col-span-2 text-right">Tx</span>
              </div>
              {fills.length === 0 ? (
                <p className="px-6 py-10 text-sm text-slate-500">
                  No fills yet. <Link href="/app/trade" className="underline hover:text-signal-500">Request a quote</Link>.
                </p>
              ) : (
                fills.map((f) => (
                  <div key={f.hash} className="grid grid-cols-12 items-center gap-3 border-b border-ink-700 px-6 py-3 text-sm last:border-b-0 hover:bg-ink-800">
                    <span className="col-span-3 font-mono text-slate-300">{new Date(f.t).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "medium" })}</span>
                    <span className="col-span-2 font-mono">{f.ticker}</span>
                    <span className={`col-span-1 font-mono ${f.side === "BUY" ? "text-pos-500" : "text-neg-500"}`}>{f.side}</span>
                    <span className="col-span-2 text-right font-mono">${fmtUsd(f.price)}</span>
                    <span className="col-span-2 text-right font-mono">{fmtUnits(BigInt(f.usdg), USDG_DECIMALS, 2)}</span>
                    <span className="col-span-2 text-right font-mono text-slate-500">
                      {EXPLORER ? <a className="hover:text-signal-500" href={`${EXPLORER}/tx/${f.hash}`} target="_blank" rel="noreferrer">{shortAddr(f.hash)}</a> : shortAddr(f.hash)}
                    </span>
                  </div>
                ))
              )}
            </section>
          </div>
        </>
      )}
      <div className="mt-6">
        <ForwardPositions />
      </div>
    </main>
  );
}
