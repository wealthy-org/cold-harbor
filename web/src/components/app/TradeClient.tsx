"use client";

import { useEffect, useMemo, useState } from "react";
import { BaseError, ContractFunctionRevertedError, UserRejectedRequestError, parseUnits, type Address, type Hash } from "viem";
import Monogram from "@/components/Monogram";
import { erc20Abi, faucetAbi, REVERT_MESSAGES, settlementAbi } from "@/lib/abi";
import { CHAIN_ID, CHAIN_NAME, DEPLOYED, EXPLORER, FEE_BPS, IS_MAINNET, QUOTES_ENABLED, SETTLEMENT, STOCK_DECIMALS, TOKENS, USDG, USDG_DECIMALS, rfqBody, rfqEndpoint } from "@/lib/chain";
import { bpsVs, fmtUnits, fmtUsd, rankKey, shortAddr, toContractQuote, viewOf, type MakerQuote, type RfqResponse, type Side } from "@/lib/quote";
import { NAMES } from "@/lib/universe";
import { useNow, useRefPrices } from "./hooks";
import TickerSelect from "./TickerSelect";
import { publicClient, useWallet } from "./WalletProvider";

const PANEL = "border border-ink-700 bg-ink-900";
const ROW_H = 52;
const QUOTE_LIFE_MS = 25_000;

type Exec = { phase: "idle" | "approving" | "filling" | "confirming" | "done" | "error"; hash?: Hash; message?: string };
type Fill = { t: number; ticker: string; side: Side; stock: string; usdg: string; price: number; fee: string; hash: Hash };

const nowMs = () => Date.now();
const trim = (s: string) => (s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s);

function parseDecimal(s: string, dp: number): bigint | null {
  if (!/^\d*\.?\d*$/.test(s) || s === "" || s === ".") return null;
  const [w, f = ""] = s.split(".");
  return parseUnits(`${w || "0"}.${f.slice(0, dp)}`, dp);
}

function explain(e: unknown): string {
  if (e instanceof BaseError) {
    if (e.walk((x) => x instanceof UserRejectedRequestError)) return "Rejected in the wallet.";
    const r = e.walk((x) => x instanceof ContractFunctionRevertedError) as ContractFunctionRevertedError | null;
    const name = r?.data?.errorName;
    if (name) return REVERT_MESSAGES[name] ?? name;
    return e.shortMessage;
  }
  return (e as Error).message ?? "Transaction failed.";
}

export default function TradeClient() {
  const { account, wrongChain, walletClient, switchChain, wallets, connect } = useWallet();
  const { prices, error: priceError } = useRefPrices();

  const [ticker, setTicker] = useState("NVDA");
  const [side, setSide] = useState<Side>("BUY");
  const [unit, setUnit] = useState<"STOCK" | "USDG">("USDG");
  const [amount, setAmount] = useState("100000");

  const [requesting, setRequesting] = useState(false);
  const [reqError, setReqError] = useState<string | null>(null);
  const [rfq, setRfq] = useState<{ resp: RfqResponse; startedAt: number } | null>(null);
  const [exec, setExec] = useState<Exec>({ phase: "idle" });
  const [balRaw, setBalRaw] = useState<{ stock: bigint; usdg: bigint } | null>(null);
  const [allowRaw, setAllowRaw] = useState<bigint | null>(null);
  const [reload, setReload] = useState(0);
  const [stale, setStale] = useState(false); // contract rejected the quote as expired/used/outdated
  const [faucet, setFaucet] = useState<{ busy: boolean; error?: string }>({ busy: false });
  const [fills, setFills] = useState<Fill[]>([]);

  const ref = prices[ticker];
  const stockAddr = TOKENS[ticker];

  // ------------------------------------------------------------ amount -> token amount
  const baseAmount = useMemo(() => {
    if (unit === "STOCK") {
      const v = parseDecimal(amount, STOCK_DECIMALS);
      return v && v > 0n ? v : null;
    }
    const usd = Number(amount);
    if (!ref || !Number.isFinite(usd) || usd <= 0) return null;
    return parseUnits((usd / ref.mid).toFixed(8), STOCK_DECIMALS);
  }, [amount, unit, ref]);

  const approxLine = useMemo(() => {
    if (!ref || !baseAmount) return "";
    return unit === "USDG"
      ? `≈ ${trim(fmtUnits(baseAmount, STOCK_DECIMALS, 4))} ${ticker}`
      : `≈ $${fmtUsd(Number(baseAmount / 10n ** 12n) / 1e6 * ref.mid)}`;
  }, [ref, baseAmount, unit, ticker]);

  // ------------------------------------------------------------ live quote room
  const now = useNow(rfq !== null);
  const elapsed = rfq ? now - rfq.startedAt : 0;
  const total = rfq?.resp.quotes.length ?? 0;
  const issued = rfq?.resp;
  const expiresAt = rfq && issued ? rfq.startedAt + (issued.quotes[0].quote.expiry * 1000 - issued.issuedAt) : 0;
  const remaining = rfq ? expiresAt - now : 0;
  const expired = rfq !== null && exec.phase !== "done" && ((now > 0 && remaining <= 0) || stale);

  const visible = useMemo<MakerQuote[]>(
    () => (rfq ? rfq.resp.quotes.filter((q) => q.latencyMs <= elapsed) : []),
    [rfq, elapsed],
  );
  const ranked = useMemo(() => {
    if (!rfq) return [];
    const s = rfq.resp.side;
    return [...visible].sort((a, b) => rankKey(s, viewOf(s, a.quote)) - rankKey(s, viewOf(s, b.quote)));
  }, [visible, rfq]);
  const best = ranked[0];
  const bestView = best && rfq ? viewOf(rfq.resp.side, best.quote) : null;
  const rfqSide = rfq?.resp.side ?? side;

  // ------------------------------------------------------------ chain reads
  const canRead = Boolean(account && DEPLOYED && stockAddr && USDG);
  useEffect(() => {
    if (!canRead || !account || !stockAddr || !USDG) return;
    let dead = false;
    (async () => {
      try {
        const [stock, usdg] = await Promise.all([
          publicClient.readContract({ address: stockAddr, abi: erc20Abi, functionName: "balanceOf", args: [account] }),
          publicClient.readContract({ address: USDG!, abi: erc20Abi, functionName: "balanceOf", args: [account] }),
        ]);
        if (!dead) setBalRaw({ stock, usdg });
      } catch {
        if (!dead) setBalRaw(null);
      }
    })();
    return () => {
      dead = true;
    };
  }, [canRead, account, stockAddr, reload]);
  const bal = canRead ? balRaw : null;

  const payToken: Address | undefined = rfqSide === "BUY" ? USDG : stockAddr;
  const payNeeded = bestView ? (rfqSide === "BUY" ? bestView.usdgAmount + bestView.fee : bestView.stockAmount) : 0n;
  const payBalance = bal ? (rfqSide === "BUY" ? bal.usdg : bal.stock) : null;

  const bestId = best?.id;
  useEffect(() => {
    if (!bestId || !account || !SETTLEMENT || !payToken) return;
    let dead = false;
    (async () => {
      try {
        const a = await publicClient.readContract({ address: payToken, abi: erc20Abi, functionName: "allowance", args: [account, SETTLEMENT!] });
        if (!dead) setAllowRaw(a);
      } catch {
        if (!dead) setAllowRaw(null);
      }
    })();
    return () => {
      dead = true;
    };
  }, [bestId, account, payToken, reload]);
  const allowance = bestId && SETTLEMENT ? allowRaw : null;

  const needsApproval = allowance !== null && bestView !== null && allowance < payNeeded;
  const insufficient = payBalance !== null && bestView !== null && payBalance < payNeeded;

  // ------------------------------------------------------------ fills (local history)
  const fillsKey = account ? `ch.fills.${CHAIN_ID}.${account.toLowerCase()}` : null;
  useEffect(() => {
    if (!fillsKey) return;
    let list: Fill[] = [];
    try {
      list = JSON.parse(localStorage.getItem(fillsKey) ?? "[]") as Fill[];
    } catch {
      /* ignore */
    }
    queueMicrotask(() => setFills(list));
  }, [fillsKey]);

  // ------------------------------------------------------------ actions
  const request = async () => {
    if (!account || !baseAmount) return;
    setRfq(null);
    setStale(false);
    setExec({ phase: "idle" });
    setReqError(null);
    setRequesting(true);
    try {
      const r = await fetch(rfqEndpoint(), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: rfqBody("spot", { ticker, side, baseAmount: baseAmount.toString(), taker: account }),
      });
      const j = (await r.json()) as RfqResponse & { error?: string };
      if (!r.ok) throw new Error(j.error ?? "Could not get quotes.");
      setRfq({ resp: j, startedAt: nowMs() });
    } catch (e) {
      setReqError((e as Error).message);
    } finally {
      setRequesting(false);
    }
  };

  const run = async () => {
    if (!best || !bestView || !walletClient || !account || !SETTLEMENT || !payToken || !best.signature) return;
    const q = toContractQuote(best.quote);
    try {
      if (needsApproval) {
        setExec({ phase: "approving" });
        const h = await walletClient.writeContract({ address: payToken, abi: erc20Abi, functionName: "approve", args: [SETTLEMENT, payNeeded], account, chain: walletClient.chain });
        await publicClient.waitForTransactionReceipt({ hash: h });
        setReload((r) => r + 1);
        setExec({ phase: "idle" });
        return;
      }
      setExec({ phase: "filling" });
      const { request: req } = await publicClient.simulateContract({ address: SETTLEMENT, abi: settlementAbi, functionName: "fillQuote", args: [q, best.signature], account });
      const hash = await walletClient.writeContract(req);
      setExec({ phase: "confirming", hash });
      const rc = await publicClient.waitForTransactionReceipt({ hash });
      if (rc.status !== "success") throw new Error("Transaction reverted on chain.");
      const f: Fill = {
        t: nowMs(),
        ticker,
        side: rfqSide,
        stock: bestView.stockAmount.toString(),
        usdg: bestView.usdgNet.toString(),
        price: bestView.price,
        fee: bestView.fee.toString(),
        hash,
      };
      setFills((prev) => {
        const next = [f, ...prev].slice(0, 50);
        if (fillsKey) localStorage.setItem(fillsKey, JSON.stringify(next));
        return next;
      });
      setExec({ phase: "done", hash });
      setReload((r) => r + 1);
    } catch (e) {
      const message = explain(e);
      if ([REVERT_MESSAGES.QuoteExpired, REVERT_MESSAGES.NonceAlreadyUsed, REVERT_MESSAGES.FeeMismatch].includes(message)) setStale(true);
      setExec({ phase: "error", message });
    }
  };

  const getTestTokens = async () => {
    if (!walletClient || !account || !USDG || !stockAddr) return;
    setFaucet({ busy: true });
    try {
      for (const [address, amount] of [[USDG, 1_000_000n * 10n ** 6n], [stockAddr, 1_000n * 10n ** 18n]] as const) {
        const h = await walletClient.writeContract({ address, abi: faucetAbi, functionName: "mint", args: [account, amount], account, chain: walletClient.chain });
        await publicClient.waitForTransactionReceipt({ hash: h });
      }
      setReload((r) => r + 1);
      setFaucet({ busy: false });
    } catch (e) {
      setFaucet({ busy: false, error: explain(e) });
    }
  };

  // ------------------------------------------------------------ primary button (form)
  const formBtn = (() => {
    if (!account) return { label: "Connect wallet to request quotes", onClick: () => (wallets.length === 1 ? void connect(wallets[0]) : window.dispatchEvent(new Event("ch:connect"))) };
    if (wrongChain) return { label: `Switch to ${CHAIN_NAME}`, onClick: () => void switchChain() };
    if (!QUOTES_ENABLED) return { label: "Quote relay not connected", disabled: true };
    if (!ref) return { label: "Waiting for reference price", disabled: true };
    if (ref.stopped) return { label: `${ticker} trading is stopped`, disabled: true };
    if (!baseAmount) return { label: "Enter an amount", disabled: true };
    return { label: requesting ? "Asking makers" : "Request quotes", onClick: () => void request(), disabled: requesting };
  })();

  // ------------------------------------------------------------ primary button (room)
  const roomBtn = (() => {
    if (exec.phase === "done") return { label: "Done. New request", onClick: () => { setRfq(null); setExec({ phase: "idle" }); } };
    if (expired) return { label: "Quote expired. Request again", onClick: () => void request() };
    if (!best) return { label: "Waiting for quotes", disabled: true };
    if (!rfq?.resp.executable) return { label: `Contracts not deployed on ${CHAIN_NAME}`, disabled: true };
    if (insufficient) return { label: `Insufficient ${rfqSide === "BUY" ? "USDG" : ticker} balance`, disabled: true };
    if (exec.phase === "approving") return { label: "Approving. Confirm in wallet", disabled: true };
    if (exec.phase === "filling") return { label: "Confirm in wallet", disabled: true };
    if (exec.phase === "confirming") return { label: "Settling on chain", disabled: true };
    if (needsApproval) return { label: `Approve ${rfqSide === "BUY" ? "USDG" : ticker}`, onClick: () => void run() };
    return { label: `Execute ${rfqSide === "BUY" ? "buy" : "sell"}`, onClick: () => void run() };
  })();

  const secs = Math.max(0, remaining / 1000);
  const urgent = secs < 6;
  const sideColor = rfqSide === "BUY" ? "text-pos-500" : "text-neg-500";

  const stepState = (i: 0 | 1 | 2): "todo" | "active" | "done" => {
    if (exec.phase === "done") return "done";
    if (i === 0) return exec.phase === "approving" ? "active" : needsApproval || allowance === null ? "todo" : "done";
    if (i === 1) return exec.phase === "filling" ? "active" : exec.phase === "confirming" ? "done" : "todo";
    return exec.phase === "confirming" ? "active" : "todo";
  };

  return (
    <main className="mx-auto max-w-[1440px] px-8 pb-24 pt-10">
      <div className="mb-8 flex items-end justify-between">
        <div>
          <p className="mono-label mb-3">Block RFQ</p>
          <h1 className="text-4xl font-semibold tracking-[-0.02em]">Request a firm quote</h1>
        </div>
        <div className="flex items-center gap-3">
          {rfq?.resp.simulated && <span className="mono-label border border-signal-500 px-3 py-1.5 !text-signal-500">Simulated makers answered</span>}
          <span className="mono-label border border-ink-700 px-3 py-1.5">Ref prices: Robinhood, indicative</span>
        </div>
      </div>

      {!DEPLOYED && (
        <div className="mb-6 border border-ink-700 bg-ink-900 px-5 py-4 text-sm leading-relaxed text-slate-300">
          The settlement contract is not deployed on {CHAIN_NAME}. You can request quotes, but execution is disabled until it is.
        </div>
      )}
      {priceError && <div className="mb-6 border border-neg-500 px-5 py-4 text-sm text-neg-500">Reference price feed: {priceError}</div>}

      <div className="grid grid-cols-12 gap-6">
        {/* ---------------------------------------------------------------- form */}
        <section className={`${PANEL} col-span-4 self-start p-6`}>
          <p className="mono-label mb-3">Market</p>
          <TickerSelect value={ticker} onChange={(t) => { setTicker(t); setRfq(null); setExec({ phase: "idle" }); }} prices={prices} />

          <div className="mt-6 grid grid-cols-2 gap-px bg-ink-700">
            {(["BUY", "SELL"] as Side[]).map((s) => (
              <button
                key={s}
                onClick={() => { setSide(s); setRfq(null); setExec({ phase: "idle" }); }}
                className={`h-12 text-sm font-medium ${side === s ? (s === "BUY" ? "bg-pos-500 text-ink-950" : "bg-neg-500 text-ink-950") : "bg-ink-950 text-slate-300 hover:text-mist-100"}`}
              >
                {s === "BUY" ? "Buy" : "Sell"}
              </button>
            ))}
          </div>

          <div className="mt-6 flex items-center justify-between">
            <p className="mono-label">Amount</p>
            <div className="flex gap-1">
              {(["USDG", "STOCK"] as const).map((u) => (
                <button
                  key={u}
                  onClick={() => { setUnit(u); setAmount(""); }}
                  className={`h-7 px-3 font-mono text-xs ${unit === u ? "bg-ink-700 text-mist-100" : "text-slate-500 hover:text-mist-100"}`}
                >
                  {u === "USDG" ? "USDG" : ticker}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-2 border border-ink-700 bg-ink-950 px-4 py-3 focus-within:border-signal-500">
            <input
              inputMode="decimal"
              value={amount}
              onChange={(e) => /^\d*\.?\d*$/.test(e.target.value) && setAmount(e.target.value)}
              placeholder="0"
              aria-label="Amount"
              className="w-full bg-transparent font-mono text-3xl outline-none placeholder:text-slate-500"
            />
            <div className="mt-2 flex items-center justify-between text-sm text-slate-500">
              <span className="font-mono">{approxLine}</span>
              {bal && (
                <button
                  className="font-mono hover:text-signal-500"
                  onClick={() => {
                    if (unit === "STOCK") return setAmount(trim(fmtUnits(bal.stock, STOCK_DECIMALS, 6)));
                    const usd = side === "BUY" ? (bal.usdg * 10_000n) / BigInt(10_000 + FEE_BPS) : (bal.stock * BigInt(Math.round((ref?.mid ?? 0) * 1e6))) / 10n ** 18n;
                    setAmount(trim(fmtUnits(usd, USDG_DECIMALS, 2)));
                  }}
                >
                  Max {unit === "STOCK" ? `${trim(fmtUnits(bal.stock, STOCK_DECIMALS, 4))} ${ticker}` : ""}
                </button>
              )}
            </div>
          </div>
          {bal && (
            <p className="mt-3 font-mono text-xs text-slate-500">
              Balance {fmtUsd(Number(bal.usdg) / 1e6)} USDG · {trim(fmtUnits(bal.stock, STOCK_DECIMALS, 4))} {ticker}
            </p>
          )}

          {!IS_MAINNET && DEPLOYED && account && !wrongChain && (
            <div className="mt-4">
              <button onClick={() => void getTestTokens()} disabled={faucet.busy} className="font-mono text-xs text-slate-300 underline decoration-ink-700 underline-offset-4 hover:text-signal-500 disabled:opacity-60">
                {faucet.busy ? "Minting test tokens" : `Get test tokens: 1,000,000 USDG + 1,000 ${ticker}`}
              </button>
              {faucet.error && <p className="mt-2 text-xs text-neg-500">{faucet.error}</p>}
            </div>
          )}

          <button
            onClick={formBtn.onClick}
            disabled={formBtn.disabled}
            className="mt-6 h-14 w-full rounded-full bg-signal-500 text-[15px] font-medium text-ink-950 hover:bg-signal-300 disabled:bg-ink-800 disabled:text-slate-500"
          >
            {formBtn.label}
          </button>
          {reqError && <p className="mt-3 text-sm text-neg-500">{reqError}</p>}
          <p className="mt-5 text-xs leading-relaxed text-slate-500">
            Quotes are private to your wallet and valid for about 25 seconds. The price you see is the price you get. No slippage.
          </p>
        </section>

        {/* ---------------------------------------------------------------- quote room */}
        <section className={`${PANEL} col-span-8 flex min-h-[640px] flex-col`}>
          <div className="flex items-center justify-between border-b border-ink-700 px-6 py-4">
            <p className="mono-label !text-mist-100">Quote room</p>
            <p className="mono-label">
              {!rfq && !requesting && "Waiting for a request"}
              {requesting && "Sending request"}
              {rfq && !expired && exec.phase !== "done" && `${visible.length} of ${total} makers responded`}
              {expired && "Expired"}
              {exec.phase === "done" && "Settled"}
            </p>
          </div>

          {!rfq ? (
            <div className="flex flex-1 flex-col justify-between p-8">
              <div>
                <p className="mono-label mb-6">Reference for {ticker}</p>
                <div className="grid grid-cols-3 gap-px bg-ink-700">
                  {[["Bid", ref?.bid], ["Mid", ref?.mid], ["Ask", ref?.ask]].map(([l, v]) => (
                    <div key={l as string} className="bg-ink-900 p-6">
                      <p className="mono-label mb-4">{l as string}</p>
                      <p className="font-mono text-4xl font-medium tracking-tight">{typeof v === "number" ? `$${fmtUsd(v)}` : "…"}</p>
                    </div>
                  ))}
                </div>
                <p className="mt-4 text-xs text-slate-500">Token-level, multiplier-adjusted, from the Robinhood Stock Token API. Indicative only. Makers quote against this.</p>
              </div>
              <ol className="mt-10 grid grid-cols-3 gap-8 border-t border-ink-700 pt-8">
                {[["01", "Request", "Pick a market and a size."], ["02", "Compare", "Makers answer in seconds, best price on top."], ["03", "Settle", "Approve, execute. One transaction."]].map(([n, t, d]) => (
                  <li key={n}>
                    <p className="font-mono text-sm text-signal-500">{n}</p>
                    <p className="mt-3 font-semibold">{t}</p>
                    <p className="mt-1 text-sm text-slate-300">{d}</p>
                  </li>
                ))}
              </ol>
            </div>
          ) : (
            <div className="flex flex-1 flex-col">
              {/* best quote */}
              <div className="relative border-b border-ink-700 px-8 pb-8 pt-7">
                {best && bestView ? (
                  <div className="fade-in">
                    <div className="flex items-center justify-between">
                      <p className="mono-label flex items-center gap-3 !text-signal-500">
                        <span className="h-2 w-2 bg-signal-500" />
                        Best quote · {best.makerName}
                      </p>
                      <p className={`font-mono text-sm tabular-nums ${exec.phase === "done" ? "text-pos-500" : urgent && !expired ? "text-neg-500" : "text-slate-300"}`}>{exec.phase === "done" ? "Settled" : expired ? "Expired" : `${secs.toFixed(1)}s`}</p>
                    </div>
                    <div className="mt-6 flex items-end justify-between">
                      <div>
                        <p className="font-mono text-6xl font-medium tracking-[-0.03em]">${fmtUsd(bestView.price)}</p>
                        <p className="mt-2 flex items-center gap-3 text-sm text-slate-300">
                          <Monogram t={ticker} size={20} /> per {ticker}
                          <span className={`font-mono ${sideColor}`}>
                            {bpsVs(bestView.price, rfq.resp.ref.mid) >= 0 ? "+" : ""}
                            {bpsVs(bestView.price, rfq.resp.ref.mid).toFixed(1)} bps vs mid
                          </span>
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="mono-label mb-2">{rfqSide === "BUY" ? "You pay" : "You receive"}</p>
                        <p className="font-mono text-4xl font-medium tracking-tight">{fmtUnits(bestView.usdgNet, USDG_DECIMALS, 2)}</p>
                        <p className="mt-1 font-mono text-sm text-slate-500">USDG</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="py-10 font-mono text-sm text-slate-500">Waiting for the first maker…</p>
                )}
                <div className="absolute inset-x-0 bottom-0 h-0.5 bg-ink-700">
                  <div className={`h-full ${exec.phase === "done" ? "bg-pos-500" : urgent ? "bg-neg-500" : "bg-signal-500"}`} style={{ width: `${exec.phase === "done" ? 100 : expired ? 0 : Math.min(100, (remaining / QUOTE_LIFE_MS) * 100)}%`, transition: "width .1s linear" }} />
                </div>
              </div>

              {/* breakdown + stepper + action */}
              <div className="grid grid-cols-2 items-start gap-10 border-b border-ink-700 px-8 py-7">
                <dl className="space-y-3 text-sm">
                  {bestView && (
                    <>
                      <div className="flex justify-between"><dt className="text-slate-300">{rfqSide === "BUY" ? "You receive" : "You sell"}</dt><dd className="font-mono">{trim(fmtUnits(bestView.stockAmount, STOCK_DECIMALS, 4))} {ticker}</dd></div>
                      <div className="flex justify-between"><dt className="text-slate-300">Price leg</dt><dd className="font-mono">{fmtUnits(bestView.usdgAmount, USDG_DECIMALS, 2)} USDG</dd></div>
                      <div className="flex justify-between"><dt className="text-slate-300">Fee ({FEE_BPS} bps)</dt><dd className="font-mono">{rfqSide === "BUY" ? "+" : "−"}{fmtUnits(bestView.fee, USDG_DECIMALS, 2)} USDG</dd></div>
                      <div className="flex justify-between border-t border-ink-700 pt-3"><dt>{rfqSide === "BUY" ? "Total you pay" : "Net you receive"}</dt><dd className="font-mono font-medium">{fmtUnits(bestView.usdgNet, USDG_DECIMALS, 2)} USDG</dd></div>
                    </>
                  )}
                </dl>
                <div>
                  <ol className="mb-6 flex items-start">
                    {[
                      { l: "Approve", sub: needsApproval || allowance === null ? "Allow the token" : "Not needed" },
                      { l: "Execute", sub: "Sign and send" },
                      { l: "Settled", sub: "Confirmed on chain" },
                    ].map((step, i, arr) => {
                      const st = stepState(i as 0 | 1 | 2);
                      const skipped = i === 0 && st === "done" && !needsApproval && exec.phase !== "approving" && exec.phase !== "done";
                      const circle =
                        st === "done"
                          ? "border-pos-500 bg-pos-500 text-ink-950"
                          : st === "active"
                            ? "border-signal-500 text-signal-500"
                            : "border-ink-700 text-slate-500";
                      const label = st === "done" ? "text-pos-500" : st === "active" ? "text-signal-500" : "text-slate-500";
                      return (
                        <li key={step.l} className="relative flex flex-1 flex-col items-center text-center">
                          {i < arr.length - 1 && (
                            <span
                              aria-hidden
                              className={`absolute left-1/2 top-[15px] h-px w-full ${st === "done" ? "bg-pos-500" : "bg-ink-700"}`}
                            />
                          )}
                          <span className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full border bg-ink-900 font-mono text-xs ${circle} ${st === "active" ? "animate-pulse" : ""}`}>
                            {st === "done" ? "✓" : i + 1}
                          </span>
                          <p className={`mono-label mt-2 ${label}`}>{step.l}</p>
                          <p className="mt-0.5 text-[11px] leading-tight text-slate-500">{skipped ? "Already allowed" : step.sub}</p>
                        </li>
                      );
                    })}
                  </ol>
                  <button
                    onClick={roomBtn.onClick}
                    disabled={roomBtn.disabled}
                    className="h-14 w-full rounded-full bg-signal-500 text-[15px] font-medium text-ink-950 hover:bg-signal-300 disabled:bg-ink-800 disabled:text-slate-500"
                  >
                    {roomBtn.label}
                  </button>
                  {exec.phase === "error" && <p className="mt-4 rounded-md border border-neg-500/30 bg-neg-500/10 px-3 py-2 text-sm text-neg-500">{exec.message}</p>}
                  {exec.hash && (
                    <p className="mt-4 text-center font-mono text-xs text-slate-500">
                      {EXPLORER ? <a className="underline hover:text-signal-500" href={`${EXPLORER}/tx/${exec.hash}`} target="_blank" rel="noreferrer">View transaction {shortAddr(exec.hash)}</a> : <>tx {shortAddr(exec.hash)}</>}
                    </p>
                  )}
                </div>
              </div>
              {/* quote ladder */}
              <div className="mt-auto px-8 py-5">
                <div className="mono-label mb-3 grid grid-cols-12 gap-4">
                  <span className="col-span-4">Maker</span>
                  <span className="col-span-3 text-right">Price</span>
                  <span className="col-span-3 text-right">vs best</span>
                  <span className="col-span-2 text-right">Reply</span>
                </div>
                <div className="relative" style={{ height: Math.max(total, 1) * ROW_H }}>
                  {ranked.map((m, i) => {
                    const v = viewOf(rfq.resp.side, m.quote);
                    const d = bestView ? Math.abs(bpsVs(v.price, bestView.price)) : 0;
                    return (
                      <div
                        key={m.id}
                        className="fade-in absolute inset-x-0 grid grid-cols-12 items-center gap-4 border-t border-ink-700"
                        style={{ height: ROW_H, transform: `translateY(${i * ROW_H}px)`, transition: "transform .55s cubic-bezier(.2,.7,.2,1)" }}
                      >
                        {i === 0 && <span className="absolute -left-8 top-0 h-full w-0.5 bg-signal-500" />}
                        <span className="col-span-4 text-sm">{m.makerName}</span>
                        <span className="col-span-3 text-right font-mono text-sm">${fmtUsd(v.price)}</span>
                        <span className={`col-span-3 text-right font-mono text-sm ${i === 0 ? "text-signal-500" : "text-slate-500"}`}>{i === 0 ? "Best" : `${d.toFixed(1)} bps`}</span>
                        <span className="col-span-2 text-right font-mono text-sm text-slate-500">{(m.latencyMs / 1000).toFixed(2)}s</span>
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>
          )}
        </section>
      </div>

      {/* ---------------------------------------------------------------- fills */}
      <section className="mt-12">
        <div className="mb-4 flex items-center justify-between">
          <p className="mono-label !text-mist-100">Your fills</p>
          <p className="mono-label">{account ? "This browser" : ""}</p>
        </div>
        <div className={PANEL}>
          <div className="mono-label grid grid-cols-12 gap-4 border-b border-ink-700 px-6 py-3">
            <span className="col-span-2">Time</span>
            <span className="col-span-2">Market</span>
            <span className="col-span-1">Side</span>
            <span className="col-span-2 text-right">Size</span>
            <span className="col-span-2 text-right">Price</span>
            <span className="col-span-2 text-right">USDG</span>
            <span className="col-span-1 text-right">Tx</span>
          </div>
          {fills.length === 0 ? (
            <p className="px-6 py-10 text-sm text-slate-500">{account ? "No fills yet. Executed quotes appear here." : "Connect a wallet to see your fills."}</p>
          ) : (
            fills.map((f) => (
              <div key={f.hash} className="grid grid-cols-12 items-center gap-4 border-b border-ink-700 px-6 py-3 text-sm last:border-b-0 hover:bg-ink-800">
                <span className="col-span-2 font-mono text-slate-300">{new Date(f.t).toLocaleTimeString("en-GB")}</span>
                <span className="col-span-2 flex items-center gap-3 font-mono"><Monogram t={f.ticker} size={22} />{f.ticker}</span>
                <span className={`col-span-1 font-mono ${f.side === "BUY" ? "text-pos-500" : "text-neg-500"}`}>{f.side}</span>
                <span className="col-span-2 text-right font-mono">{trim(fmtUnits(BigInt(f.stock), STOCK_DECIMALS, 4))}</span>
                <span className="col-span-2 text-right font-mono">${fmtUsd(f.price)}</span>
                <span className="col-span-2 text-right font-mono">{fmtUnits(BigInt(f.usdg), USDG_DECIMALS, 2)}</span>
                <span className="col-span-1 text-right font-mono text-slate-500">{EXPLORER ? <a className="hover:text-signal-500" href={`${EXPLORER}/tx/${f.hash}`} target="_blank" rel="noreferrer">{shortAddr(f.hash)}</a> : shortAddr(f.hash)}</span>
              </div>
            ))
          )}
        </div>
      </section>
      <p className="mt-10 text-xs text-slate-500">{NAMES[ticker]} token units. Decimals are assumed to be {STOCK_DECIMALS} for stock tokens and {USDG_DECIMALS} for USDG; confirm on chain before mainnet.</p>
    </main>
  );
}
