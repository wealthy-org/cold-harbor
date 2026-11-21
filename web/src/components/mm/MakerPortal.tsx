"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { formatUnits, parseUnits } from "viem";
import ConnectButton from "@/components/app/ConnectButton";
import { useWallet } from "@/components/app/WalletProvider";
import { RELAY_URL } from "@/lib/chain";
import HeroField from "@/components/HeroField";

type Limit = { ticker: string; maxNotional: string; maxOpenForwards: number };
type Me = { wallet: string; name: string; status: string; simulated: boolean; apiKeyPrefix: string | null; connected: boolean; limits: Limit[]; tickers: string[] };
type QuoteRow = { rfq_id: string; product: string; ticker: string; side: string; outcome: string; reject_reason: string | null; received_ms: number; net_price: string | null; created_at: string };

const TOKEN_KEY = "ch.mm.session";
const usdg = (units: string) => Number(formatUnits(BigInt(units), 6)).toLocaleString("en-US", { maximumFractionDigits: 0 });

async function call<T>(method: string, path: string, token: string | null, body?: unknown): Promise<T> {
  const r = await fetch(RELAY_URL + path, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const j = (await r.json().catch(() => ({}))) as T & { error?: string };
  if (!r.ok) throw Object.assign(new Error(j.error ?? `Request failed (${r.status})`), { status: r.status });
  return j;
}

/* ——— Interactive WebSocket Terminal Mock with Simulated Real-Time Messages ——— */
const SAMPLE_STREAM = [
  { time: "16:42:01.102", type: "rfq.request", side: "BUY", sym: "NVDA", sz: "5,000", notional: "$711,250", status: "BROADCAST" },
  { time: "16:42:01.340", type: "quote.submit", side: "SELL", sym: "NVDA", sz: "5,000", price: "$142.25", status: "ACK" },
  { time: "16:42:02.890", type: "quote.result", sym: "NVDA", outcome: "WON", tx: "0x4f82…d91a", status: "FILLED" },
  { time: "16:42:15.010", type: "rfq.request", side: "SELL", sym: "TSLA", sz: "2,500", notional: "$587,500", status: "BROADCAST" },
  { time: "16:42:15.220", type: "quote.submit", side: "BUY", sym: "TSLA", sz: "2,500", price: "$235.00", status: "ACK" },
  { time: "16:42:28.450", type: "rfq.request", side: "LONG", sym: "AAPL", fwd: "28D", notional: "$1,200,000", status: "FORWARD" },
];

function InteractiveTerminal() {
  const [activeTab, setActiveTab] = useState<"stream" | "spec">("stream");
  const [copied, setCopied] = useState(false);

  const payloadSnippet = `{
  "type": "quote.submit",
  "rfqId": "0x9f1c...e2",
  "quote": {
    "maker": "0xMM...",
    "makerToken": "0xd060...NVDA",
    "makerAmount": "5000000000000000000000",
    "takerAmount": "711600000000",
    "expiry": 1763690425,
    "feeBps": 8
  },
  "signature": "0x..."
}`;

  return (
    <div className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-ink-700 bg-ink-900/95 shadow-2xl transition-all duration-300 hover:border-signal-500/50 hover:shadow-[0_0_50px_-15px_rgba(255,176,32,0.2)]">
      {/* Top Bar with Mac Window Controls & Tab switcher */}
      <div className="flex items-center justify-between border-b border-ink-700 bg-ink-950/70 px-5 py-3.5 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="flex gap-2">
            <span className="h-3 w-3 rounded-full bg-[#ff5f56]/80 transition-opacity hover:opacity-100" />
            <span className="h-3 w-3 rounded-full bg-[#ffbd2e]/80 transition-opacity hover:opacity-100" />
            <span className="h-3 w-3 rounded-full bg-[#27c93f]/80 transition-opacity hover:opacity-100" />
          </div>
          <span className="ml-2 font-mono text-[11px] uppercase tracking-[0.1em] text-slate-400">
            /mm/ws <span className="text-signal-500">·</span> RFQ STREAM
          </span>
        </div>

        <div className="flex items-center gap-1 rounded-full border border-ink-700 bg-ink-900 p-1">
          <button
            onClick={() => setActiveTab("stream")}
            className={`rounded-full px-3 py-1 font-mono text-[10px] uppercase tracking-[0.08em] transition-all ${
              activeTab === "stream" ? "bg-signal-500 font-semibold text-ink-950 shadow-sm" : "text-slate-400 hover:text-mist-100"
            }`}
          >
            Live Logs
          </button>
          <button
            onClick={() => setActiveTab("spec")}
            className={`rounded-full px-3 py-1 font-mono text-[10px] uppercase tracking-[0.08em] transition-all ${
              activeTab === "spec" ? "bg-signal-500 font-semibold text-ink-950 shadow-sm" : "text-slate-400 hover:text-mist-100"
            }`}
          >
            EIP-712 Spec
          </button>
        </div>
      </div>

      {/* Terminal View Body */}
      {activeTab === "stream" ? (
        <div className="flex flex-1 flex-col justify-between p-5 font-mono text-[12px] leading-relaxed">
          <div className="space-y-3 overflow-y-auto">
            <div className="flex items-center gap-2 text-slate-500">
              <span className="inline-block h-1.5 w-1.5 animate-ping rounded-full bg-pos-500" />
              <span>ws://broker-relay.internal:8080/mm/ws connected [TLS/WSS]</span>
            </div>
            {SAMPLE_STREAM.map((msg, i) => (
              <div
                key={i}
                className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-lg border border-transparent p-2 transition-all hover:border-ink-700 hover:bg-ink-800/40"
              >
                <span className="text-slate-500 text-[11px]">{msg.time}</span>
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                    msg.type.includes("request")
                      ? "bg-info-500/10 text-info-500"
                      : msg.type.includes("submit")
                        ? "bg-signal-500/10 text-signal-500"
                        : "bg-pos-500/10 text-pos-500"
                  }`}
                >
                  {msg.type}
                </span>
                <span className="font-semibold text-mist-100">{msg.sym}</span>
                {msg.side && (
                  <span className={msg.side === "BUY" || msg.side === "LONG" ? "text-pos-500" : "text-neg-500"}>
                    {msg.side}
                  </span>
                )}
                {msg.sz && <span className="text-slate-300">{msg.sz} shr</span>}
                {msg.notional && <span className="text-slate-400">({msg.notional})</span>}
                {msg.price && <span className="text-signal-400">@ {msg.price}</span>}
                {msg.outcome && <span className="font-bold text-pos-500">{msg.outcome}</span>}
                {msg.tx && <span className="text-[11px] text-slate-500">{msg.tx}</span>}
              </div>
            ))}
          </div>

          <div className="mt-4 flex items-center justify-between border-t border-ink-700/60 pt-3 text-[11px] text-slate-400">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-pos-500" />
              <span>Subscribed to: <span className="text-mist-100">spot.rfq.*, forward.rfq.*</span></span>
            </div>
            <span className="text-slate-500">Latency: ~24ms</span>
          </div>
        </div>
      ) : (
        <div className="relative flex flex-1 flex-col justify-between p-5 font-mono text-[12px] leading-relaxed">
          <button
            onClick={async () => {
              await navigator.clipboard.writeText(payloadSnippet);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            className="absolute right-6 top-6 rounded-md border border-ink-700 bg-ink-800/80 px-3 py-1 text-[11px] text-slate-300 transition-colors hover:border-signal-500 hover:text-signal-400"
          >
            {copied ? "Copied ✓" : "Copy Payload"}
          </button>
          <pre className="overflow-x-auto text-slate-300">
            <code>{payloadSnippet}</code>
          </pre>
          <div className="border-t border-ink-700/60 pt-3 text-[11px] text-slate-400">
            EIP-712 Domain: <span className="text-mist-100">{`{ name: "Cold Harbor", version: "1", chainId: 4663 }`}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function MakerPortal() {
  const { account, walletClient } = useWallet();
  const [token, setToken] = useState<string | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [quotes, setQuotes] = useState<QuoteRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [lt, setLt] = useState("*");
  const [lamt, setLamt] = useState("");
  const [lopen, setLopen] = useState("0");

  const out = useCallback(() => {
    sessionStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setMe(null);
    setQuotes([]);
    setNewKey(null);
  }, []);

  const load = useCallback(
    async (t: string) => {
      try {
        const [m, q] = await Promise.all([call<Me>("GET", "/mm/me", t), call<{ items: QuoteRow[] }>("GET", "/mm/quotes", t)]);
        setMe(m);
        setQuotes(q.items);
      } catch (e) {
        if ((e as { status?: number }).status === 401) out();
        else setErr((e as Error).message);
      }
    },
    [out],
  );

  useEffect(() => {
    const t = sessionStorage.getItem(TOKEN_KEY);
    if (!t) return;
    void (async () => {
      await Promise.resolve();
      setToken(t);
      await load(t);
    })();
  }, [load]);

  const mismatch = !!(me && account && me.wallet.toLowerCase() !== account.toLowerCase());
  const authed = !!token && !mismatch;

  useEffect(() => {
    if (!token) return;
    const i = setInterval(() => void load(token), 8_000);
    return () => clearInterval(i);
  }, [token, load]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setErr(null);
    try {
      await fn();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const signIn = () =>
    run(async () => {
      if (!account || !walletClient) throw new Error("Connect your maker wallet first.");
      const n = await call<{ nonce: string; message: string }>("POST", "/mm/nonce", null, { wallet: account });
      const signature = await walletClient.signMessage({ account, message: n.message });
      const r = await call<{ token: string }>("POST", "/mm/login", null, { wallet: account, nonce: n.nonce, signature });
      sessionStorage.setItem(TOKEN_KEY, r.token);
      setToken(r.token);
      await load(r.token);
    });

  const rotate = () =>
    run(async () => {
      if (!token) return;
      if (me?.apiKeyPrefix && !window.confirm("This replaces your current key and disconnects your running market maker. Continue?")) return;
      const r = await call<{ apiKey: string }>("POST", "/mm/key", token);
      setNewKey(r.apiKey);
      await load(token);
    });

  const saveLimit = () =>
    run(async () => {
      if (!token) return;
      const maxNotional = parseUnits(lamt || "0", 6).toString();
      await call("PUT", "/mm/limits", token, { ticker: lt.trim().toUpperCase() || "*", maxNotional, maxOpenForwards: Number(lopen || 0) });
      setLamt("");
      await load(token);
    });

  const dropLimit = (ticker: string) =>
    run(async () => {
      if (!token) return;
      await call("DELETE", `/mm/limits/${encodeURIComponent(ticker)}`, token);
      await load(token);
    });

  const wsUrl = RELAY_URL.replace(/^http/, "ws") + "/mm/ws";

  const outcomeColor = (o: string): "pos" | "neg" | "signal" | "slate" => {
    if (o === "won" || o === "filled") return "pos";
    if (o === "rejected") return "neg";
    if (o === "pending") return "signal";
    return "slate";
  };

  return (
    <div className="relative min-h-svh overflow-hidden bg-ink-950 text-mist-100">
      {/* ——— Top Navigation Bar ——— */}
      <header className="sticky top-0 z-40 border-b border-ink-700 bg-ink-950/80 backdrop-blur-xl">
        <div className="mx-auto flex h-[72px] max-w-[1440px] items-center justify-between px-4 lg:px-16">
          <Link href="/" className="flex items-center gap-3 transition-opacity hover:opacity-85">
            <Image src="/logo.png" alt="" width={36} height={36} priority />
            <span className="text-lg font-semibold tracking-tight">Cold Harbor</span>
            <span className="ml-2 rounded-full border border-ink-700 bg-ink-900 px-3 py-0.5 font-mono text-[11px] uppercase tracking-[0.08em] text-slate-300">
              Market Makers
            </span>
          </Link>
          <div className="flex items-center gap-5">
            {authed && (
              <button
                onClick={() => {
                  void call("POST", "/mm/logout", token).catch(() => {});
                  out();
                }}
                className="font-mono text-xs uppercase tracking-wider text-slate-400 hover:text-signal-500"
              >
                Sign out
              </button>
            )}
            <ConnectButton />
          </div>
        </div>
      </header>

      {/* ——— Main Body ——— */}
      <main className="relative z-10 mx-auto max-w-[1440px] px-4 py-12 lg:px-16 lg:py-16">
        {!RELAY_URL && (
          <div className="mb-8 rounded-xl border border-neg-500/30 bg-neg-500/10 p-4 text-sm text-neg-500">
            ⚠ NEXT_PUBLIC_RELAY_URL is not set. The portal talks to the relay and cannot work without it.
          </div>
        )}

        {err && (
          <div role="alert" className="mb-8 flex items-center justify-between rounded-xl border border-neg-500/30 bg-neg-500/10 p-4 text-sm text-neg-500">
            <span>✕ {err}</span>
            <button onClick={() => setErr(null)} className="text-neg-500 hover:text-white">✕</button>
          </div>
        )}

        {/* ——— Unauthenticated State: Hero + Interactive WS Terminal ——— */}
        {!authed && (
          <section className="relative">
            {/* Background Canvas Effect from Landing Page */}
            <div className="pointer-events-none absolute -inset-x-16 -top-16 bottom-0 overflow-hidden opacity-40">
              <HeroField />
            </div>

            <div className="relative z-10 grid grid-cols-12 items-center gap-10 lg:min-h-[calc(100svh-180px)] lg:gap-14">
              {/* Left Column: Headline and Call-to-Action */}
              <div className="hero-in col-span-12 lg:col-span-6">
                <div className="mb-6 flex items-center gap-3">
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-signal-500/30 font-mono text-[11px] text-signal-500">
                    01
                  </span>
                  <span className="h-px w-8 bg-ink-700" />
                  <p className="mono-label">Maker Portal · Institutional Access</p>
                </div>

                <h1 className="h1-display max-w-[15ch]">
                  Sign in with your <span className="text-signal-500">maker</span> wallet.
                </h1>

                <p className="mt-8 max-w-lg text-lg leading-relaxed text-slate-300">
                  Prove ownership of your quoting address via a single off-chain cryptographic signature. No gas, no transaction fee, and no approvals required.
                </p>

                <div className="mt-10 flex flex-wrap items-center gap-4">
                  <button
                    onClick={signIn}
                    disabled={busy || !account || !RELAY_URL}
                    className="group inline-flex h-14 items-center gap-3 rounded-full bg-signal-500 px-8 text-base font-semibold text-ink-950 shadow-[0_0_35px_-8px_rgba(255,176,32,0.45)] transition-all hover:bg-signal-400 hover:shadow-[0_0_45px_-6px_rgba(255,176,32,0.6)] active:scale-[0.98] disabled:opacity-40 disabled:hover:shadow-none"
                  >
                    <span>{busy ? "Waiting for signature…" : account ? "Sign in to portal" : "Connect maker wallet"}</span>
                    <span className="transition-transform group-hover:translate-x-1">→</span>
                  </button>
                  <Link
                    href="/docs#relay"
                    className="inline-flex h-14 items-center rounded-full border border-ink-700 px-7 text-sm font-medium text-slate-300 transition-colors hover:border-signal-500 hover:text-mist-100"
                  >
                    View API Docs
                  </Link>
                </div>

                {/* Badges / Guarantees */}
                <div className="mt-14 grid grid-cols-3 gap-6 border-t border-ink-700/80 pt-8">
                  <div>
                    <p className="font-mono text-xs uppercase tracking-wider text-slate-500">Security</p>
                    <p className="mt-1 text-sm font-medium text-mist-100">Zero gas / No tx</p>
                  </div>
                  <div>
                    <p className="font-mono text-xs uppercase tracking-wider text-slate-500">Auth</p>
                    <p className="mt-1 text-sm font-medium text-mist-100">EIP-191 Nonce</p>
                  </div>
                  <div>
                    <p className="font-mono text-xs uppercase tracking-wider text-slate-500">Session</p>
                    <p className="mt-1 text-sm font-medium text-mist-100">8h TTL token</p>
                  </div>
                </div>
              </div>

              {/* Right Column: Live Interactive WebSocket Preview Terminal */}
              <div className="col-span-12 h-[480px] lg:col-span-6">
                <InteractiveTerminal />
              </div>
            </div>
          </section>
        )}

        {/* ——— Authenticated State ——— */}
        {authed && !me && (
          <div className="flex items-center justify-center py-24">
            <div className="flex items-center gap-3">
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-ink-700 border-t-signal-500" />
              <span className="mono-label">Syncing with Cold Harbor Relay…</span>
            </div>
          </div>
        )}

        {me && authed && (
          <div className="space-y-10">
            {/* Top Stat Cards Grid */}
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
              {/* Profile Card */}
              <div className="relative overflow-hidden rounded-2xl border border-ink-700 bg-ink-900/90 p-7 shadow-xl">
                <p className="mono-label flex items-center justify-between text-slate-500">
                  <span>Maker Profile</span>
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-mono uppercase ${
                    me.status === "active" ? "border border-pos-500/30 bg-pos-500/10 text-pos-500" : "border border-signal-500/30 bg-signal-500/10 text-signal-500"
                  }`}>
                    {me.status}
                  </span>
                </p>
                <h2 className="mt-4 text-2xl font-bold tracking-tight text-mist-100">{me.name}</h2>
                <p className="mt-2 break-all font-mono text-xs text-slate-400">{me.wallet}</p>
                <div className="mt-4 text-[11px] text-slate-500">
                  {me.simulated ? "Simulated Sandboxed Maker" : "Registered Institutional Partner"}
                </div>
              </div>

              {/* WebSocket Status */}
              <div className="relative overflow-hidden rounded-2xl border border-ink-700 bg-ink-900/90 p-7 shadow-xl">
                <p className="mono-label text-slate-500">RFQ Stream Status</p>
                <div className="mt-4 flex items-center gap-3">
                  <span className="relative flex h-3 w-3">
                    {me.connected && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-pos-500 opacity-75" />}
                    <span className={`relative inline-flex h-3 w-3 rounded-full ${me.connected ? "bg-pos-500" : "bg-neg-500"}`} />
                  </span>
                  <span className="text-xl font-semibold text-mist-100">{me.connected ? "Active & Receiving" : "Disconnected"}</span>
                </div>
                <p className="mt-2 break-all font-mono text-xs text-slate-500">{wsUrl}</p>
              </div>

              {/* API Key Manager */}
              <div className="relative overflow-hidden rounded-2xl border border-ink-700 bg-ink-900/90 p-7 shadow-xl">
                <p className="mono-label text-slate-500">API Key</p>
                <div className="mt-4 flex items-center justify-between">
                  <span className="font-mono text-lg font-semibold text-mist-100">
                    {me.apiKeyPrefix ? `${me.apiKeyPrefix}••••••••` : "No Key Generated"}
                  </span>
                  <button
                    onClick={rotate}
                    disabled={busy}
                    className="rounded-full border border-signal-500/40 px-4 py-1 font-mono text-xs uppercase tracking-wider text-signal-500 transition-colors hover:bg-signal-500/10 hover:border-signal-500"
                  >
                    {me.apiKeyPrefix ? "Rotate" : "Create"}
                  </button>
                </div>
                <p className="mt-3 text-xs text-slate-400">Pass via <code className="text-signal-400">X-API-Key</code> on WebSocket connection.</p>
              </div>
            </div>

            {/* Secret Key Alert Banner */}
            {newKey && (
              <div className="relative rounded-2xl border border-signal-500 bg-signal-500/10 p-6 shadow-2xl">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="mono-label !text-signal-500">⚡ Save Your API Key (Shown only once)</p>
                    <code className="mt-2 block break-all rounded-lg bg-ink-950 p-3 font-mono text-sm text-mist-100">{newKey}</code>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => { void navigator.clipboard.writeText(newKey); }}
                      className="rounded-lg bg-signal-500 px-4 py-2 font-mono text-xs font-semibold text-ink-950 hover:bg-signal-400"
                    >
                      Copy
                    </button>
                    <button
                      onClick={() => setNewKey(null)}
                      className="rounded-lg border border-ink-700 bg-ink-900 px-4 py-2 font-mono text-xs text-slate-300 hover:text-white"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Limits Panel */}
            <div className="rounded-2xl border border-ink-700 bg-ink-900/90 p-8 shadow-xl">
              <div className="flex items-center justify-between border-b border-ink-700/80 pb-5">
                <div>
                  <h3 className="text-xl font-semibold tracking-tight text-mist-100">Quoting & Risk Limits</h3>
                  <p className="mt-1 text-sm text-slate-400">
                    Quotes that exceed these limits are filtered out before reaching takers. Use <code className="text-signal-400">*</code> for all tickers.
                  </p>
                </div>
                <span className="font-mono text-xs text-slate-500">{me.limits.length} rules active</span>
              </div>

              <div className="mt-6 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-ink-700/60 font-mono text-xs uppercase tracking-wider text-slate-500">
                      <th className="pb-3">Ticker</th>
                      <th className="pb-3">Max Notional (USDG)</th>
                      <th className="pb-3">Max Open Forwards</th>
                      <th className="pb-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-700/30">
                    {me.limits.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-6 text-center text-slate-500">
                          No limits set — defaulting to full vault balance.
                        </td>
                      </tr>
                    ) : (
                      me.limits.map((l) => (
                        <tr key={l.ticker} className="hover:bg-ink-800/40">
                          <td className="py-3 font-mono font-semibold text-mist-100">{l.ticker}</td>
                          <td className="py-3 font-mono text-slate-300">{usdg(l.maxNotional)} USDG</td>
                          <td className="py-3 font-mono text-slate-300">{l.maxOpenForwards === 0 ? "Unlimited" : l.maxOpenForwards}</td>
                          <td className="py-3 text-right">
                            <button
                              onClick={() => dropLimit(l.ticker)}
                              className="font-mono text-xs text-neg-500 hover:underline"
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Add limit input form */}
              <div className="mt-6 flex flex-wrap items-end gap-4 rounded-xl border border-ink-700/60 bg-ink-950/70 p-4">
                <div>
                  <label className="mono-label block !text-[10px]">Ticker</label>
                  <input
                    list="tickers"
                    value={lt}
                    onChange={(e) => setLt(e.target.value)}
                    className="mt-1 h-10 w-28 rounded-lg border border-ink-700 bg-ink-900 px-3 font-mono uppercase text-mist-100 focus:border-signal-500 focus:outline-none"
                  />
                  <datalist id="tickers">
                    <option value="*" />
                    {me.tickers.map((t) => (
                      <option key={t} value={t} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <label className="mono-label block !text-[10px]">Max Notional (USDG)</label>
                  <input
                    inputMode="decimal"
                    value={lamt}
                    onChange={(e) => /^\d*\.?\d{0,6}$/.test(e.target.value) && setLamt(e.target.value)}
                    placeholder="e.g. 500000"
                    className="mt-1 h-10 w-44 rounded-lg border border-ink-700 bg-ink-900 px-3 font-mono text-mist-100 focus:border-signal-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="mono-label block !text-[10px]">Max Open Forwards</label>
                  <input
                    inputMode="numeric"
                    value={lopen}
                    onChange={(e) => /^\d{0,5}$/.test(e.target.value) && setLopen(e.target.value)}
                    className="mt-1 h-10 w-32 rounded-lg border border-ink-700 bg-ink-900 px-3 font-mono text-mist-100 focus:border-signal-500 focus:outline-none"
                  />
                </div>

                <button
                  onClick={saveLimit}
                  disabled={busy || !lamt}
                  className="h-10 rounded-lg bg-signal-500 px-6 font-mono text-xs font-semibold uppercase tracking-wider text-ink-950 hover:bg-signal-400 disabled:opacity-40"
                >
                  Save Limit
                </button>
              </div>
            </div>

            {/* Recent Quotes Table */}
            <div className="rounded-2xl border border-ink-700 bg-ink-900/90 p-8 shadow-xl">
              <div className="flex items-center justify-between border-b border-ink-700/80 pb-5">
                <div>
                  <h3 className="text-xl font-semibold tracking-tight text-mist-100">Live Quote Audit Log</h3>
                  <p className="mt-1 text-sm text-slate-400">Stream of recent RFQ invitations and your engine&apos;s responses.</p>
                </div>
                <span className="font-mono text-xs text-slate-500">{quotes.length} events logged</span>
              </div>

              <div className="mt-6 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-ink-700/60 font-mono text-xs uppercase tracking-wider text-slate-500">
                      <th className="pb-3">Timestamp</th>
                      <th className="pb-3">Product</th>
                      <th className="pb-3">Ticker</th>
                      <th className="pb-3">Side</th>
                      <th className="pb-3">Outcome</th>
                      <th className="pb-3">Latency</th>
                      <th className="pb-3">Reason / Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-700/30">
                    {quotes.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-slate-500">
                          No recent quotes. When takers submit RFQs, they will appear here in real time.
                        </td>
                      </tr>
                    ) : (
                      quotes.map((q) => (
                        <tr key={q.rfq_id} className="hover:bg-ink-800/40">
                          <td className="py-3 font-mono text-xs text-slate-400">
                            {new Date(q.created_at).toLocaleTimeString()}
                          </td>
                          <td className="py-3">
                            <span className="rounded bg-ink-800 px-2 py-0.5 font-mono text-[11px] uppercase text-slate-300">
                              {q.product}
                            </span>
                          </td>
                          <td className="py-3 font-mono font-semibold text-mist-100">{q.ticker}</td>
                          <td className="py-3">
                            <span className={q.side === "BUY" || q.side === "LONG" ? "font-semibold text-pos-500" : "font-semibold text-neg-500"}>
                              {q.side}
                            </span>
                          </td>
                          <td className="py-3">
                            <span
                              className={`rounded px-2 py-0.5 font-mono text-[11px] font-semibold uppercase ${
                                outcomeColor(q.outcome) === "pos"
                                  ? "bg-pos-500/10 text-pos-500"
                                  : outcomeColor(q.outcome) === "neg"
                                    ? "bg-neg-500/10 text-neg-500"
                                    : "bg-signal-500/10 text-signal-500"
                              }`}
                            >
                              {q.outcome}
                            </span>
                          </td>
                          <td className="py-3 font-mono text-xs text-slate-400">{q.received_ms} ms</td>
                          <td className="py-3 text-xs text-slate-400">{q.reject_reason || "—"}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
