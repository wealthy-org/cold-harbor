"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { parseUnits, type Address } from "viem";
import Monogram from "@/components/Monogram";
import {
  CHAIN_NAME, EXPLORER, FW_CALENDAR, FW_DEPLOYED, FW_ENGINE, FW_VAULT, IS_MAINNET, QUOTES_ENABLED, STOCK_DECIMALS, TOKENS, USDG, USDG_DECIMALS, rfqBody, rfqEndpoint,
} from "@/lib/chain";
import { erc20Abi, faucetAbi } from "@/lib/abi";
import {
  calendarAbi, engineAbi, notionalOf, toContractForwardQuote, vaultAbi, type ForwardRfqResponse, type FwSide,
} from "@/lib/forwards";
import { fmtUnits, fmtUsd, shortAddr } from "@/lib/quote";
import { ETFS, NAMES } from "@/lib/universe";
import ForwardPositions from "./ForwardPositions";
import { useNow, useRefPrices } from "./hooks";
import TickerSelect from "./TickerSelect";
import { useTx, type Req } from "./useTx";
import { publicClient, useWallet } from "./WalletProvider";

const PANEL = "border border-ink-700 bg-ink-900";
const MIN_DAYS = 7;
const MAX_DAYS = 92;
const FEE_BPS = 20;
const DOW = ["M", "T", "W", "T", "F", "S", "S"];
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const usd = (v: bigint, dp = 2) => fmtUnits(v, USDG_DECIMALS, dp);

function Calendar({ value, onChange, today }: { value: string | null; onChange: (d: string) => void; today: Date }) {
  const [offset, setOffset] = useState(0);
  const first = new Date(today.getFullYear(), today.getMonth() + offset, 1);
  const lead = (first.getDay() + 6) % 7;
  const days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const lo = new Date(today.getFullYear(), today.getMonth(), today.getDate() + MIN_DAYS);
  const hi = new Date(today.getFullYear(), today.getMonth(), today.getDate() + MAX_DAYS);
  const cells: (Date | null)[] = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => new Date(first.getFullYear(), first.getMonth(), i + 1))];
  const title = first.toLocaleString("en-US", { month: "long", year: "numeric" });
  return (
    <div className="border border-ink-700 bg-ink-950 p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="font-mono text-sm">{title}</p>
        <div className="flex gap-1">
          <button onClick={() => setOffset((o) => Math.max(0, o - 1))} disabled={offset === 0} aria-label="Previous month" className="h-8 w-8 text-slate-300 hover:text-signal-500 disabled:text-ink-700">‹</button>
          <button onClick={() => setOffset((o) => Math.min(3, o + 1))} disabled={offset === 3} aria-label="Next month" className="h-8 w-8 text-slate-300 hover:text-signal-500 disabled:text-ink-700">›</button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {DOW.map((d, i) => <span key={i} className="mono-label py-1 text-center !text-[10px]">{d}</span>)}
        {cells.map((d, i) => {
          if (!d) return <span key={i} />;
          const k = iso(d);
          const weekend = d.getDay() === 0 || d.getDay() === 6;
          const ok = !weekend && d >= lo && d <= hi;
          return (
            <button key={i} disabled={!ok} onClick={() => onChange(k)} className={`h-9 font-mono text-sm ${value === k ? "bg-signal-500 text-ink-950" : ok ? "text-mist-100 hover:bg-ink-800" : "text-ink-700"}`}>
              {d.getDate()}
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-slate-500">Maturity is an official US market close (16:00 New York). The MarketCalendar contract confirms the date you pick, including holidays.</p>
    </div>
  );
}

function VaultPanel({ onChange }: { onChange: () => void }) {
  const { account } = useWallet();
  const [state, setState] = useState<{ free: bigint; locked: bigint; wallet: bigint; allowance: bigint } | null>(null);
  const [amt, setAmt] = useState("");
  const [tick, setTick] = useState(0);
  const done = useCallback(() => {
    setTick((t) => t + 1);
    onChange();
  }, [onChange]);
  const tx = useTx(done);

  useEffect(() => {
    if (!account || !FW_VAULT || !USDG) return;
    let dead = false;
    (async () => {
      const [free, locked, wallet, allowance] = await Promise.all([
        publicClient.readContract({ address: FW_VAULT, abi: vaultAbi, functionName: "freeMargin", args: [account] }),
        publicClient.readContract({ address: FW_VAULT, abi: vaultAbi, functionName: "lockedOf", args: [account] }),
        publicClient.readContract({ address: USDG, abi: erc20Abi, functionName: "balanceOf", args: [account] }),
        publicClient.readContract({ address: USDG, abi: erc20Abi, functionName: "allowance", args: [account, FW_VAULT] }),
      ]);
      if (!dead) setState({ free, locked, wallet, allowance });
    })().catch(() => {});
    return () => {
      dead = true;
    };
  }, [account, tick]);

  if (!FW_VAULT || !USDG) return null;
  const usdgAddr = USDG as Address;
  const vault = FW_VAULT as Address;
  let parsed: bigint | null = null;
  try {
    parsed = amt ? parseUnits(amt, USDG_DECIMALS) : null;
  } catch {
    parsed = null;
  }
  const deposit = () => {
    if (!parsed) return;
    const reqs: Req[] = [];
    if ((state?.allowance ?? 0n) < parsed) reqs.push({ address: usdgAddr, abi: erc20Abi, functionName: "approve", args: [vault, parsed] });
    reqs.push({ address: vault, abi: vaultAbi, functionName: "deposit", args: [parsed] });
    void tx.run("Depositing", reqs);
  };
  const cells: [string, string][] = [
    ["Wallet USDG", state ? usd(state.wallet) : "…"],
    ["Free margin", state ? usd(state.free) : "…"],
    ["Locked in forwards", state ? usd(state.locked) : "…"],
  ];
  return (
    <section className={`${PANEL} mb-6 flex flex-wrap items-end justify-between gap-6 px-6 py-5`}>
      <div className="flex gap-10">
        {cells.map(([l, v]) => (
          <div key={l}>
            <p className="mono-label mb-1 !text-[10px]">{l}</p>
            <p className="font-mono text-xl">{v}</p>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <input aria-label="USDG amount" inputMode="decimal" placeholder="USDG" value={amt} onChange={(e) => /^\d*\.?\d*$/.test(e.target.value) && setAmt(e.target.value)} className="h-11 w-36 border border-ink-700 bg-ink-950 px-3 font-mono outline-none focus:border-signal-500" />
        <button disabled={!account || !parsed || !!tx.busy} onClick={deposit} className="h-11 bg-signal-500 px-5 text-sm font-medium text-ink-950 disabled:bg-ink-800 disabled:text-slate-500">Deposit</button>
        <button disabled={!account || !parsed || !!tx.busy} onClick={() => parsed && void tx.run("Withdrawing", [{ address: vault, abi: vaultAbi, functionName: "withdraw", args: [parsed] }])} className="h-11 border border-ink-700 px-5 text-sm hover:border-signal-500 disabled:text-slate-500">Withdraw</button>
        {!IS_MAINNET && account && (
          <button disabled={!!tx.busy} onClick={() => void tx.run("Minting test USDG", [{ address: usdgAddr, abi: faucetAbi, functionName: "mint", args: [account, 1_000_000n * 10n ** BigInt(USDG_DECIMALS)] }])} className="h-11 border border-signal-500 px-5 text-sm text-signal-500 disabled:opacity-50">
            Get 1,000,000 test USDG
          </button>
        )}
      </div>
      {tx.busy && <p className="w-full text-sm text-signal-500">{tx.busy}… confirm in your wallet</p>}
      {tx.error && <p className="w-full text-sm text-neg-500">{tx.error}</p>}
    </section>
  );
}

export default function ForwardsClient() {
  const { prices } = useRefPrices();
  const { account, wrongChain, switchChain } = useWallet();
  const [ticker, setTicker] = useState("NVDA");
  const [side, setSide] = useState<FwSide>("LONG");
  const [qty, setQty] = useState("1000");
  const [date, setDate] = useState<string | null>(null);
  const [today, setToday] = useState<Date | null>(null);
  const [mat, setMat] = useState<{ date: string; ts: number; ok: boolean } | null>(null);
  const [rfq, setRfq] = useState<{ r: ForwardRfqResponse; at: number } | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [rfqError, setRfqError] = useState<string | null>(null);
  const [free, setFree] = useState<bigint | null>(null);
  const [reload, setReload] = useState(0);
  const bump = useCallback(() => setReload((n) => n + 1), []);
  const tx = useTx(bump);
  const now = useNow(!!rfq, 250);

  useEffect(() => {
    queueMicrotask(() => setToday(new Date()));
  }, []);

  // Ask the MarketCalendar contract whether the chosen date has an official close.
  useEffect(() => {
    if (!date || !FW_CALENDAR) return;
    let dead = false;
    (async () => {
      const day = BigInt(Math.floor(Date.parse(`${date}T00:00:00Z`) / 86_400_000));
      const ts = await publicClient.readContract({ address: FW_CALENDAR, abi: calendarAbi, functionName: "regularCloseOf", args: [day] });
      const ok = await publicClient.readContract({ address: FW_CALENDAR, abi: calendarAbi, functionName: "isOfficialClose", args: [ts] });
      if (!dead) setMat({ date, ts: Number(ts), ok });
    })().catch(() => {});
    return () => {
      dead = true;
    };
  }, [date]);
  const matNow = mat && mat.date === date ? mat : null;

  useEffect(() => {
    if (!account || !FW_VAULT) return;
    let dead = false;
    publicClient
      .readContract({ address: FW_VAULT, abi: vaultAbi, functionName: "freeMargin", args: [account] })
      .then((v) => !dead && setFree(v))
      .catch(() => {});
    return () => {
      dead = true;
    };
  }, [account, reload]);

  const ref = prices[ticker];
  const qtyBig = useMemo(() => {
    try {
      return /^\d*\.?\d*$/.test(qty) && qty !== "" && qty !== "." ? parseUnits(qty, STOCK_DECIMALS) : 0n;
    } catch {
      return 0n;
    }
  }, [qty]);
  const refNotional = ref ? notionalOf(qtyBig, BigInt(Math.round(ref.mid * 1e8))) : 0n;
  const imBps = ETFS.has(ticker) ? 1000n : 2000n;
  const days = matNow && today ? Math.round((matNow.ts * 1000 - today.getTime()) / 86_400_000) : null;
  const deployedHere = FW_DEPLOYED && Boolean(TOKENS[ticker]);

  const problem = useMemo(() => {
    if (!FW_DEPLOYED) return "Forward contracts are not configured on this network";
    if (!account) return "Connect a wallet";
    if (!ref) return "Waiting for reference price";
    if (qtyBig <= 0n) return "Enter a quantity";
    if (refNotional < 10_000n * 10n ** 6n) return "Minimum notional is 10,000 USDG";
    if (refNotional > 1_000_000n * 10n ** 6n) return "Maximum notional is 1,000,000 USDG";
    if (!date) return "Choose a maturity date";
    if (!matNow) return "Checking the date with the MarketCalendar…";
    if (!matNow.ok) return "That date is not an official market close (holiday)";
    if (!QUOTES_ENABLED) return "No maker network connected yet";
    return null;
  }, [account, ref, qtyBig, refNotional, date, matNow]);

  const getQuotes = async () => {
    if (!account || !matNow) return;
    setQuoting(true);
    setRfqError(null);
    setRfq(null);
    try {
      const res = await fetch(rfqEndpoint(), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: rfqBody("forward", { ticker, side, qty: qtyBig.toString(), maturityCloseTs: matNow.ts, taker: account }),
      });
      const j = (await res.json()) as ForwardRfqResponse & { error?: string };
      if (!res.ok) throw new Error(j.error ?? "Quote request failed");
      setRfq({ r: j, at: Date.now() });
    } catch (e) {
      setRfqError((e as Error).message);
    } finally {
      setQuoting(false);
    }
  };

  const ranked = useMemo(() => {
    if (!rfq) return [];
    const long = side === "LONG";
    return [...rfq.r.quotes].sort((a, b) => {
      const d = BigInt(a.quote.strike) - BigInt(b.quote.strike);
      return Number(long ? d : -d);
    });
  }, [rfq, side]);
  const best = ranked[0];
  const remainingMs = rfq && best && now ? best.quote.expiry * 1000 - rfq.r.issuedAt - (now - rfq.at) : null;
  const expired = remainingMs !== null && remainingMs <= 0;
  const bestN = best ? notionalOf(BigInt(best.quote.qty), BigInt(best.quote.strike)) : 0n;
  const bestIm = best ? (bestN * BigInt(best.quote.imBps)) / 10_000n : 0n;
  const bestFee = (bestN * BigInt(FEE_BPS)) / 10_000n;
  const need = bestIm + bestFee;
  const short = free !== null && best ? need > free : false;

  const open = async () => {
    if (!best || !FW_ENGINE) return;
    const ok = await tx.run("Opening forward", [{ address: FW_ENGINE, abi: engineAbi, functionName: "openForward", args: [toContractForwardQuote(best.quote), best.signature] }]);
    if (ok) setRfq(null);
  };

  const rows: [string, string][] = [
    ["Reference price", ref ? `$${fmtUsd(ref.mid)}` : "…"],
    ["Notional at reference", `${usd(refNotional, 0)} USDG`],
    [`Initial margin (${Number(imBps) / 100}%)`, `${usd((refNotional * imBps) / 10_000n)} USDG`],
    ["Opening fee (taker)", `${FEE_BPS / 100}% of notional`],
    ["Maturity", matNow ? `${date} · 16:00 NY · ${days} days` : "Not selected"],
    ["Settlement price", "Price feed at the official close"],
  ];

  return (
    <main className="mx-auto max-w-[1440px] px-8 pb-24 pt-10">
      <div className="mb-8 flex items-end justify-between">
        <div>
          <p className="mono-label mb-3">Cash-settled forwards</p>
          <h1 className="text-4xl font-semibold tracking-[-0.02em]">Fix a price for a future close</h1>
        </div>
        <span className="mono-label border border-signal-500 px-3 py-1.5 !text-signal-500">{IS_MAINNET ? "Mainnet" : `${CHAIN_NAME} · mock feeds`}</span>
      </div>

      {FW_DEPLOYED && <VaultPanel onChange={bump} />}

      <div className="mb-6 grid grid-cols-12 gap-6">
        <section className={`${PANEL} col-span-4 self-start p-6`}>
          <p className="mono-label mb-3">Market</p>
          <TickerSelect value={ticker} onChange={(t) => { setTicker(t); setRfq(null); }} prices={prices} />
          <div className="mt-6 grid grid-cols-2 gap-px bg-ink-700">
            {(["LONG", "SHORT"] as const).map((s) => (
              <button key={s} onClick={() => { setSide(s); setRfq(null); }} className={`h-12 text-sm font-medium ${side === s ? (s === "LONG" ? "bg-pos-500 text-ink-950" : "bg-neg-500 text-ink-950") : "bg-ink-950 text-slate-300 hover:text-mist-100"}`}>
                {s === "LONG" ? "Long" : "Short"}
              </button>
            ))}
          </div>
          <p className="mono-label mb-2 mt-6">Quantity ({ticker})</p>
          <div className="border border-ink-700 bg-ink-950 px-4 py-3 focus-within:border-signal-500">
            <input inputMode="decimal" value={qty} onChange={(e) => { if (/^\d*\.?\d*$/.test(e.target.value)) { setQty(e.target.value); setRfq(null); } }} aria-label="Quantity" className="w-full bg-transparent font-mono text-3xl outline-none" />
          </div>
          <p className="mono-label mb-2 mt-6">Maturity</p>
          {today ? <Calendar value={date} onChange={(d) => { setDate(d); setRfq(null); }} today={today} /> : <div className="h-[340px] border border-ink-700 bg-ink-950" />}
        </section>

        <section className={`${PANEL} col-span-8 flex flex-col`}>
          <div className="flex items-center justify-between border-b border-ink-700 px-6 py-4">
            <p className="mono-label !text-mist-100">{rfq ? "Quotes" : "Terms"}</p>
            <p className="mono-label">{rfq ? `${rfq.r.quotes.length} makers${rfq.r.simulated ? " · simulated" : ""}` : "Indicative"}</p>
          </div>

          {!rfq ? (
            <>
              <div className="border-b border-ink-700 px-8 py-8">
                <p className="mono-label mb-4 flex items-center gap-3"><Monogram t={ticker} size={22} />{side} {NAMES[ticker]}</p>
                <p className="font-mono text-6xl font-medium tracking-[-0.03em]">{refNotional ? usd(refNotional, 0) : "…"} <span className="text-2xl text-slate-500">USDG</span></p>
                <p className="mt-3 text-sm text-slate-300">Notional at the current reference price. The strike comes from makers when you request quotes.</p>
              </div>
              <dl className="px-8 py-6">
                {rows.map(([l, v]) => (
                  <div key={l} className="flex justify-between border-b border-ink-700 py-3 text-sm last:border-b-0">
                    <dt className="text-slate-300">{l}</dt>
                    <dd className="font-mono">{v}</dd>
                  </div>
                ))}
              </dl>
            </>
          ) : (
            <div className="px-8 py-6">
              <ul>
                {ranked.map((q, i) => {
                  const strike = BigInt(q.quote.strike);
                  const n = notionalOf(BigInt(q.quote.qty), strike);
                  const vsRef = ref ? ((Number(strike) / 1e8 / ref.mid - 1) * 10_000).toFixed(1) : "…";
                  return (
                    <li key={q.id} className={`flex items-center justify-between border-b border-ink-700 py-4 last:border-b-0 ${i === 0 ? "" : "opacity-70"}`}>
                      <div>
                        <p className="text-sm">{q.makerName} {i === 0 && <span className="mono-label ml-2 border border-signal-500 px-2 py-0.5 !text-[10px] !text-signal-500">Best</span>}</p>
                        <p className="font-mono text-xs text-slate-500">{shortAddr(q.quote.maker)} · {q.latencyMs} ms · margin {q.quote.imBps / 100}%</p>
                      </div>
                      <div className="text-right">
                        <p className="font-mono text-2xl">${fmtUnits(strike, 8, 2)}</p>
                        <p className="font-mono text-xs text-slate-500">{vsRef} bps vs reference · {usd(n, 0)} USDG</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
              {best && (
                <dl className="mt-4 border-t border-ink-700 pt-4 text-sm">
                  {([
                    ["Margin to lock (your side)", `${usd(bestIm)} USDG`],
                    ["Opening fee", `${usd(bestFee)} USDG`],
                    ["Needed in free margin", `${usd(need)} USDG`],
                    ["Quote valid for", expired ? "Expired" : remainingMs === null ? "…" : `${Math.ceil(remainingMs / 1000)}s`],
                  ] as const).map(([l, v]) => (
                    <div key={l} className="flex justify-between py-1.5"><dt className="text-slate-300">{l}</dt><dd className="font-mono">{v}</dd></div>
                  ))}
                </dl>
              )}
            </div>
          )}

          <div className="mt-auto border-t border-ink-700 px-8 py-6">
            {rfqError && <p className="mb-3 text-sm text-neg-500">{rfqError}</p>}
            {tx.error && <p className="mb-3 text-sm text-neg-500">{tx.error}</p>}
            {tx.hash && !tx.error && !rfq && (
              <p className="mb-3 text-sm text-pos-500">Forward opened. {EXPLORER && <a className="underline" href={`${EXPLORER}/tx/${tx.hash}`} target="_blank" rel="noreferrer">View transaction</a>}</p>
            )}
            {wrongChain && account ? (
              <button onClick={() => void switchChain()} className="h-14 w-full rounded-full bg-signal-500 text-[15px] font-medium text-ink-950">Switch to {CHAIN_NAME}</button>
            ) : rfq && best && !expired ? (
              short ? (
                <button disabled className="h-14 w-full rounded-full bg-ink-800 text-[15px] font-medium text-slate-500">Deposit {usd(need - (free ?? 0n))} more USDG into the vault first</button>
              ) : (
                <button disabled={!!tx.busy} onClick={open} className="h-14 w-full rounded-full bg-signal-500 text-[15px] font-medium text-ink-950 disabled:opacity-60">
                  {tx.busy ? "Confirm in your wallet…" : `Open ${side === "LONG" ? "long" : "short"} at $${fmtUnits(BigInt(best.quote.strike), 8, 2)}`}
                </button>
              )
            ) : (
              <button disabled={!!problem || quoting || !deployedHere} onClick={getQuotes} className="h-14 w-full rounded-full bg-signal-500 text-[15px] font-medium text-ink-950 disabled:bg-ink-800 disabled:text-slate-500">
                {quoting ? "Requesting quotes…" : expired ? "Quote expired, request again" : (problem ?? (deployedHere ? "Request quotes" : `${ticker} is not deployed here`))}
              </button>
            )}
            <p className="mt-4 text-xs leading-relaxed text-slate-500">
              Testnet: makers are simulated and prices come from a mock feed that anyone can update. Strike = reference + 4% annual carry + maker spread. Margin, fee and tenor are proposed defaults from the dev brief. The maker holds the opposite side. Losses are capped at posted margin.
            </p>
          </div>
        </section>
      </div>

      <ForwardPositions reloadKey={reload} />
    </main>
  );
}
