"use client";

import { useCallback, useEffect, useState } from "react";
import { parseUnits, type Address, type Hash, type Hex } from "viem";
import Monogram from "@/components/Monogram";
import {
  CHAIN_ID, EXPLORER, FW_DEPLOYED, FW_ENGINE, FW_FEEDS, FW_FROM_BLOCK, IS_MAINNET, RELAY_URL, STOCK_DECIMALS, TOKENS, USDG_DECIMALS, closeProposalEndpoint,
} from "@/lib/chain";
import { CLOSE_TYPES, closeDomain, engineAbi, feedAbi, notionalOf, SETTLE_GRACE_S, STATUS } from "@/lib/forwards";
import { fmtUnits, shortAddr } from "@/lib/quote";
import { useNow, useRefPrices } from "./hooks";
import { useTx } from "./useTx";
import { publicClient, useWallet } from "./WalletProvider";

const PANEL = "border border-ink-700 bg-ink-900";
const TICKER_OF = Object.fromEntries(Object.entries(TOKENS).map(([t, a]) => [a.toLowerCase(), t]));

type Position = {
  maker: Address; taker: Address; stockToken: Address; feed: Address; side: number; qty: bigint; strike: bigint;
  maturityCloseTs: bigint; makerMargin: bigint; takerMargin: bigint; mmBps: number; status: number; callDeadline: bigint; callParty: Address;
};
type Row = {
  id: bigint; p: Position; openHash: Hash; pnl: bigint; eqT: bigint; eqM: bigint; mark: bigint; live: boolean; req: bigint; feedTs: number;
};

const money = (v: bigint, dp = 2) => fmtUnits(v, USDG_DECIMALS, dp);
const px = (v: bigint) => fmtUnits(v, 8, 2);
const dateOf = (ts: number) => new Date(ts * 1000).toISOString().slice(0, 10);

function Tx({ h }: { h: Hash }) {
  return EXPLORER ? <a className="underline hover:text-signal-500" href={`${EXPLORER}/tx/${h}`} target="_blank" rel="noreferrer">tx {shortAddr(h)}</a> : <>tx {shortAddr(h)}</>;
}

type CloseState = { status: "none" | "pending" | "ready"; price?: string; hasMakerSig?: boolean; hasTakerSig?: boolean; makerSig?: string | null; takerSig?: string | null };

/** Early unwind by agreement: either side proposes a price and signs it, the other accepts by
 * signing the same price, and either can then submit closeByMutual with both signatures. The
 * relay only matches the two signatures; it never moves funds. */
function MutualClose({ id, mine, engine, strike, onDone }: { id: bigint; mine: boolean; engine: Address; strike: bigint; onDone: () => void }) {
  const { account, walletClient } = useWallet();
  const tx = useTx(onDone);
  const [state, setState] = useState<CloseState>({ status: "none" });
  const [price, setPrice] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!RELAY_URL) return;
    try {
      const r = await fetch(closeProposalEndpoint(id));
      setState((await r.json()) as CloseState);
    } catch {
      /* relay offline; leave last known state */
    }
  }, [id]);

  useEffect(() => {
    let dead = false;
    void (async () => {
      await Promise.resolve();
      if (!dead) await refresh();
    })();
    const i = setInterval(() => void refresh(), 8_000);
    return () => {
      dead = true;
      clearInterval(i);
    };
  }, [refresh]);

  const sign = async (p: bigint) => {
    if (!account || !walletClient) return;
    setBusy(true);
    setErr(null);
    try {
      const signature = await walletClient.signTypedData({ account, domain: closeDomain(CHAIN_ID, engine), types: CLOSE_TYPES, primaryType: "Close", message: { id, price: p } });
      const r = await fetch(closeProposalEndpoint(id), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ price: p.toString(), signature }) });
      const j = (await r.json()) as CloseState & { error?: string };
      if (!r.ok) throw new Error(j.error ?? "Could not submit the proposal.");
      setState(j);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const propose = () => {
    let p: bigint;
    try {
      p = parseUnits(price || "0", 8);
    } catch {
      return;
    }
    if (p > 0n) void sign(p);
  };

  const execute = () => {
    if (!state.makerSig || !state.takerSig || !state.price) return;
    void tx.run("Closing by agreement", [{ address: engine, abi: engineAbi, functionName: "closeByMutual", args: [id, BigInt(state.price), state.makerSig as Hex, state.takerSig as Hex] }]);
  };

  if (!RELAY_URL) return null;
  const mySig = mine ? state.hasTakerSig : state.hasMakerSig;
  const theirSig = mine ? state.hasMakerSig : state.hasTakerSig;

  return (
    <div className="mt-4 border-t border-ink-800 pt-4">
      <p className="mono-label mb-2 !text-[10px]">Mutual close</p>
      {state.status === "ready" ? (
        <button disabled={!!tx.busy} onClick={execute} className="h-10 bg-signal-500 px-4 text-sm font-medium text-ink-950 disabled:opacity-50">
          {tx.busy ? "Confirm in your wallet…" : `Submit close at $${px(BigInt(state.price ?? "0"))}`}
        </button>
      ) : state.status === "pending" && theirSig && !mySig ? (
        <button disabled={busy} onClick={() => state.price && void sign(BigInt(state.price))} className="h-10 bg-signal-500 px-4 text-sm font-medium text-ink-950 disabled:opacity-50">
          {busy ? "Confirm in your wallet…" : `Accept close at $${px(BigInt(state.price ?? "0"))}`}
        </button>
      ) : state.status === "pending" && mySig ? (
        <p className="font-mono text-sm text-slate-300">
          Proposed closing at ${px(BigInt(state.price ?? "0"))}. Waiting for the other side to accept.
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <input aria-label="Proposed close price" inputMode="decimal" placeholder={`$${px(strike)}`} value={price} onChange={(e) => /^\d*\.?\d*$/.test(e.target.value) && setPrice(e.target.value)} className="h-10 w-32 border border-ink-700 bg-ink-950 px-3 font-mono text-sm outline-none focus:border-signal-500" />
          <button disabled={busy || !price} onClick={propose} className="h-10 border border-ink-700 px-4 text-sm hover:border-signal-500 disabled:text-slate-500">
            {busy ? "Confirm in your wallet…" : "Propose close"}
          </button>
        </div>
      )}
      {(err ?? tx.error) && <p className="mt-2 text-xs text-neg-500">{err ?? tx.error}</p>}
      <p className="mt-2 text-xs text-slate-500">Both sides sign the same price off chain. Either can then submit it on chain. No funds move until that transaction.</p>
    </div>
  );
}

/** Forward positions of the connected wallet, read from ForwardOpened logs and live contract state. */
export default function ForwardPositions({ reloadKey = 0 }: { reloadKey?: number }) {
  const { account } = useWallet();
  const { prices } = useRefPrices();
  const now = useNow(true, 1000);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const engine = FW_ENGINE as Address;
  const [tick, setTick] = useState(0);
  const [topUp, setTopUp] = useState<Record<string, string>>({});
  const [note, setNote] = useState<Record<string, string>>({});
  const reload = useCallback(() => setTick((t) => t + 1), []);
  const tx = useTx(reload);

  useEffect(() => {
    if (!account || !FW_ENGINE) return;
    let dead = false;
    (async () => {
      try {
        const logs = await publicClient.getContractEvents({ address: engine, abi: engineAbi, eventName: "ForwardOpened", fromBlock: FW_FROM_BLOCK, toBlock: "latest" });
        const mine = logs.filter((l) => l.args.maker?.toLowerCase() === account.toLowerCase() || l.args.taker?.toLowerCase() === account.toLowerCase());
        const out = await Promise.all(
          mine.map(async (l): Promise<Row> => {
            const id = l.args.id as bigint;
            const [p, m, req] = await Promise.all([
              publicClient.readContract({ address: engine, abi: engineAbi, functionName: "getPosition", args: [id] }),
              publicClient.readContract({ address: engine, abi: engineAbi, functionName: "markToMarket", args: [id] }),
              publicClient.readContract({ address: engine, abi: engineAbi, functionName: "requiredMargin", args: [id] }),
            ]);
            let feedTs = 0;
            try {
              const r = await publicClient.readContract({ address: p.feed, abi: feedAbi, functionName: "latestRoundData" });
              feedTs = Number(r[3]);
            } catch {
              /* feed without rounds */
            }
            return { id, p: p as Position, openHash: l.transactionHash as Hash, pnl: m[0], eqT: m[1], eqM: m[2], mark: m[3], live: m[4], req, feedTs };
          })
        );
        if (dead) return;
        setRows(out.sort((a, b) => Number(b.id - a.id)));
        setLoadError(null);
      } catch (e) {
        if (!dead) setLoadError((e as Error).message.split("\n")[0]);
      }
    })();
    return () => {
      dead = true;
    };
  }, [account, tick, reloadKey, engine]);

  if (!FW_DEPLOYED || !FW_ENGINE) return null;

  const nowS = Math.floor(now / 1000);
  const feedFor = (r: Row) => Object.entries(FW_FEEDS).find(([, f]) => f.toLowerCase() === r.p.feed.toLowerCase())?.[0];

  const mockPrice = (r: Row, backdateTo?: number) => {
    const t = TICKER_OF[r.p.stockToken.toLowerCase()];
    const ref = t ? prices[t] : undefined;
    if (!ref) return setNote((n) => ({ ...n, [String(r.id)]: "Waiting for the reference price." }));
    const price = BigInt(Math.round(ref.mid * 1e8));
    void tx.run("Updating mock price", [
      backdateTo
        ? { address: r.p.feed, abi: feedAbi, functionName: "pushAt", args: [price, BigInt(backdateTo)] }
        : { address: r.p.feed, abi: feedAbi, functionName: "push", args: [price] },
    ]);
  };

  return (
    <section className={PANEL}>
      <div className="flex items-center justify-between border-b border-ink-700 px-6 py-4">
        <p className="mono-label !text-mist-100">Your forwards</p>
        <p className="mono-label">{rows ? `${rows.length} total` : account ? "Loading…" : "Connect a wallet"}</p>
      </div>
      {(loadError || tx.error) && <p className="border-b border-ink-700 px-6 py-3 text-sm text-neg-500">{loadError ?? tx.error}</p>}
      {tx.busy && <p className="border-b border-ink-700 px-6 py-3 text-sm text-signal-500">{tx.busy}… confirm in your wallet</p>}
      {rows?.length === 0 && <p className="px-6 py-8 text-sm text-slate-300">No forwards yet. Open one above and it appears here.</p>}
      <ul>
        {rows?.map((r) => {
          const mine = account && r.p.taker.toLowerCase() === account.toLowerCase();
          const key = String(r.id);
          const ticker = TICKER_OF[r.p.stockToken.toLowerCase()] ?? "?";
          const takerLong = r.p.side === 0;
          const long = mine ? takerLong : !takerLong;
          const open = r.p.status === 1;
          const myPnl = mine ? r.pnl : -r.pnl;
          const myEq = mine ? r.eqT : r.eqM;
          const myMargin = mine ? r.p.takerMargin : r.p.makerMargin;
          const notional = notionalOf(r.p.qty, r.p.strike);
          const maturity = Number(r.p.maturityCloseTs);
          const under = open && (r.eqT < r.req || r.eqM < r.req);
          const called = open && r.p.callDeadline > 0n;
          const deadline = Number(r.p.callDeadline);
          const settleOpen = open && nowS >= maturity + SETTLE_GRACE_S;
          const closeRecordable = settleOpen && r.feedTs > 0 && r.feedTs <= maturity;
          return (
            <li key={key} className="border-b border-ink-700 px-6 py-5 last:border-b-0">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <Monogram t={ticker} size={26} />
                  <div>
                    <p className="font-medium">
                      #{key} · {long ? "Long" : "Short"} {ticker} <span className="text-slate-500">as {mine ? "taker" : "maker"}</span>
                    </p>
                    <p className="font-mono text-xs text-slate-500"><Tx h={r.openHash} /></p>
                  </div>
                </div>
                <span className={`mono-label border px-2.5 py-1 ${open ? "border-signal-500 !text-signal-500" : "border-ink-700"}`}>{STATUS[r.p.status]}</span>
              </div>

              <dl className="mt-4 grid grid-cols-2 gap-x-8 gap-y-2 text-sm md:grid-cols-4">
                {([
                  ["Quantity", `${fmtUnits(r.p.qty, STOCK_DECIMALS, 2)} ${ticker}`],
                  ["Strike", `$${px(r.p.strike)}`],
                  ["Notional", `${money(notional, 0)} USDG`],
                  ["Matures", `${dateOf(maturity)} close`],
                  ["Mark", open ? `$${px(r.mark)}${r.live ? "" : " (stale)"}` : "n/a"],
                  ["Your P&L", open ? `${myPnl >= 0n ? "+" : ""}${money(myPnl)} USDG` : "n/a"],
                  ["Your margin", `${money(myMargin)} USDG`],
                  ["Equity / maintenance", open ? `${money(myEq, 0)} / ${money(r.req, 0)}` : "n/a"],
                ] as const).map(([l, v]) => (
                  <div key={l}>
                    <dt className="mono-label !text-[10px]">{l}</dt>
                    <dd className="font-mono">{v}</dd>
                  </div>
                ))}
              </dl>

              {open && (
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <input
                    aria-label="Top-up amount"
                    inputMode="decimal"
                    placeholder="USDG"
                    value={topUp[key] ?? ""}
                    onChange={(e) => /^\d*\.?\d*$/.test(e.target.value) && setTopUp((t) => ({ ...t, [key]: e.target.value }))}
                    className="h-10 w-28 border border-ink-700 bg-ink-950 px-3 font-mono text-sm outline-none focus:border-signal-500"
                  />
                  <button
                    disabled={!!tx.busy || !topUp[key]}
                    onClick={() => void tx.run("Adding margin", [{ address: engine, abi: engineAbi, functionName: "topUp", args: [r.id, parseUnits(topUp[key] || "0", USDG_DECIMALS)] }])}
                    className="h-10 border border-ink-700 px-4 text-sm hover:border-signal-500 disabled:text-slate-500"
                  >
                    Add margin
                  </button>
                  {!IS_MAINNET && !r.live && feedFor(r) && (
                    <button disabled={!!tx.busy} onClick={() => mockPrice(r)} className="h-10 border border-signal-500 px-4 text-sm text-signal-500 disabled:opacity-50">
                      Refresh mock price
                    </button>
                  )}
                  {under && !called && (
                    <button disabled={!!tx.busy} onClick={() => void tx.run("Flagging margin call", [{ address: engine, abi: engineAbi, functionName: "flagMarginCall", args: [r.id] }])} className="h-10 border border-neg-500 px-4 text-sm text-neg-500 disabled:opacity-50">
                      Flag margin call
                    </button>
                  )}
                  {called && nowS <= deadline && <span className="font-mono text-sm text-neg-500">Margin call: {Math.floor(Math.max(0, deadline - nowS) / 60)} min left to top up</span>}
                  {called && nowS > deadline && (
                    <button disabled={!!tx.busy} onClick={() => void tx.run("Liquidating", [{ address: engine, abi: engineAbi, functionName: "liquidate", args: [r.id] }])} className="h-10 bg-neg-500 px-4 text-sm font-medium text-ink-950 disabled:opacity-50">
                      Liquidate
                    </button>
                  )}
                  {settleOpen ? (
                    <>
                      <button disabled={!!tx.busy} onClick={() => void tx.run("Settling", [{ address: engine, abi: engineAbi, functionName: "settle", args: [r.id] }])} className="h-10 bg-signal-500 px-4 text-sm font-medium text-ink-950 disabled:opacity-50">
                        Settle
                      </button>
                      {!IS_MAINNET && feedFor(r) && (
                        <button
                          disabled={!!tx.busy || !closeRecordable}
                          title={closeRecordable ? undefined : "A later price is already on the mock feed, so the close can no longer be back-dated."}
                          onClick={() => mockPrice(r, maturity)}
                          className="h-10 border border-signal-500 px-4 text-sm text-signal-500 disabled:border-ink-700 disabled:text-slate-500"
                        >
                          Record close price (mock)
                        </button>
                      )}
                    </>
                  ) : (
                    <span className="font-mono text-xs text-slate-500">Settles after {dateOf(maturity)} 16:00 New York, +5 min</span>
                  )}
                </div>
              )}
              {note[key] && <p className="mt-3 text-sm text-slate-300">{note[key]}</p>}
              {open && settleOpen && <p className="mt-3 text-xs text-slate-500">If Settle leaves the forward open, no close price was available. On testnet, record the close price first, then settle again.</p>}
              {open && account && <MutualClose id={r.id} mine={!!mine} engine={engine} strike={r.p.strike} onDone={reload} />}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

