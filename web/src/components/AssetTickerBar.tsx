"use client";

import { useState, useEffect, useMemo } from "react";
import Monogram from "@/components/Monogram";

type Asset = {
  ticker: string;
  name: string;
  price: string;
  change: string;
  up: boolean;
  feed: string;
};

const ASSETS: Asset[] = [
  { ticker: "NVDA", name: "NVIDIA Corp", price: "$148.50", change: "+3.12%", up: true, feed: "24/7 Custom" },
  { ticker: "MSTR", name: "MicroStrategy", price: "$384.10", change: "+6.90%", up: true, feed: "24/5 US Equities" },
  { ticker: "AAPL", name: "Apple Inc", price: "$228.40", change: "+1.05%", up: true, feed: "24/5 US Equities" },
  { ticker: "TSLA", name: "Tesla Inc", price: "$238.25", change: "+4.80%", up: true, feed: "24/7 Custom" },
  { ticker: "AMZN", name: "Amazon.com Inc", price: "$195.60", change: "-0.45%", up: false, feed: "24/5 US Equities" },
  { ticker: "COIN", name: "Coinbase Global", price: "$212.80", change: "+2.40%", up: true, feed: "24/5 US Equities" },
  { ticker: "MSFT", name: "Microsoft Corp", price: "$422.90", change: "-0.30%", up: false, feed: "24/5 US Equities" },
  { ticker: "GOOGL", name: "Alphabet Inc", price: "$176.80", change: "+1.85%", up: true, feed: "24/5 US Equities" },
];

// Rolling digit component: smoothly rolls digits (0-9) vertically like a mechanical/split-flap board
function RollingDigit({ char }: { char: string }) {
  const isDigit = /\d/.test(char);
  if (!isDigit) {
    return <span className="inline-block select-none">{char}</span>;
  }

  const digit = parseInt(char, 10);

  return (
    <span className="relative inline-block h-[1.2em] w-[0.62em] overflow-hidden align-baseline">
      <span
        className="absolute left-0 top-0 flex flex-col transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]"
        style={{ transform: `translateY(-${digit * 10}%)` }}
      >
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
          <span key={n} className="flex h-[1.2em] items-center justify-center">
            {n}
          </span>
        ))}
      </span>
    </span>
  );
}

// Rolling Price container: combines rolling digits with real-time green/red tick glow flash
function RollingPrice({
  price,
  up,
  tickKey,
}: {
  price: string;
  up: boolean;
  tickKey: string;
}) {
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    setFlash(true);
    const t = setTimeout(() => setFlash(false), 850);
    return () => clearTimeout(t);
  }, [tickKey]);

  return (
    <div
      className={`inline-flex items-baseline font-mono text-2xl sm:text-3xl font-bold tracking-tight transition-all duration-500 ${
        flash
          ? up
            ? "text-pos-400 [text-shadow:0_0_18px_rgba(34,197,94,0.7)] scale-[1.02]"
            : "text-neg-400 [text-shadow:0_0_18px_rgba(244,63,94,0.7)] scale-[1.02]"
          : "text-mist-100 scale-100"
      }`}
    >
      {price.split("").map((c, i) => (
        <RollingDigit key={i} char={c} />
      ))}
    </div>
  );
}

export default function AssetTickerBar() {
  const [index, setIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    if (isPaused) return;
    const timer = setInterval(() => {
      setIndex((prev) => (prev + 1) % ASSETS.length);
    }, 3800);
    return () => clearInterval(timer);
  }, [isPaused]);

  const cur = ASSETS[index];

  return (
    <section
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      className="border-b border-ink-700 bg-ink-900/80 py-5 transition-colors duration-200 hover:bg-ink-900"
      aria-label="Live Asset Oracle Bar"
    >
      <div className="mx-auto flex max-w-[1440px] flex-col items-start justify-between gap-5 px-4 sm:flex-row sm:items-center lg:px-16">
        {/* Left: Coin Icon & Ticker Info with 3D Flip & Slide Animation */}
        <div className="flex items-center gap-5 sm:gap-7">
          <div className="flex items-center gap-3.5">
            {/* Coin 3D flip on ticker change */}
            <div key={`coin-${cur.ticker}`} className="anim-coin-flip shrink-0">
              <Monogram t={cur.ticker} size={36} />
            </div>

            {/* Ticker Symbol & Name with slide animation */}
            <div key={`text-${cur.ticker}`} className="anim-slide-up flex items-baseline gap-2.5">
              <span className="font-mono text-xl font-bold tracking-tight text-mist-100 sm:text-2xl">
                {cur.ticker}
              </span>
              <span className="hidden text-xs text-slate-400 sm:inline">
                {cur.name}
              </span>
            </div>
          </div>

          {/* Feed Tag */}
          <span
            key={`feed-${cur.ticker}`}
            className="anim-slide-up rounded border border-ink-700 bg-ink-950 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-signal-500"
          >
            {cur.feed}
          </span>
        </div>

        {/* Right: Rolling Number Price, Animated Percentage Pill, and Oracle Pulse */}
        <div className="flex flex-wrap items-center gap-4 sm:gap-6 font-mono">
          {/* Animated Rolling Price Digits with Flash Glow */}
          <RollingPrice price={cur.price} up={cur.up} tickKey={cur.ticker} />

          {/* Percentage Badge with directional slide transition */}
          <div
            key={`change-${cur.ticker}`}
            className={`${
              cur.up ? "anim-slide-up text-pos-400 bg-pos-500/10 border-pos-500/30" : "anim-slide-down text-neg-400 bg-neg-500/10 border-neg-500/30"
            } inline-flex items-center gap-1.5 rounded border px-2.5 py-1 text-xs sm:text-sm font-semibold tracking-tight transition-all`}
          >
            <span>{cur.change}</span>
            <span className="text-[10px]">{cur.up ? "▲" : "▼"}</span>
          </div>

          {/* Chainlink Reference with Live Pulsing Radar Beacon */}
          <div className="hidden items-center gap-2 border-l border-ink-700/80 pl-5 text-slate-400 md:flex">
            <span className="relative flex h-2 w-2 items-center justify-center">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-pos-500 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-pos-500" />
            </span>
            <span className="font-mono text-[11px] uppercase tracking-wider text-slate-400">
              Chainlink Reference
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
