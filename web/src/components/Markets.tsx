"use client";
import { useMemo, useState } from "react";
import Monogram from "@/components/Monogram";
import { ETFS, FEED_24_7, NAMES, TICKERS } from "@/lib/universe";

const FILTERS = ["All", "Stocks", "ETFs", "24/7 feed"] as const;

export default function Markets() {
  const [f, setF] = useState<(typeof FILTERS)[number]>("All");
  const [q, setQ] = useState("");
  const list = useMemo(
    () =>
      TICKERS.filter((t) => {
        if (q && !(t.includes(q.toUpperCase()) || NAMES[t].toUpperCase().includes(q.toUpperCase()))) return false;
        if (f === "Stocks") return !ETFS.has(t);
        if (f === "ETFs") return ETFS.has(t);
        if (f === "24/7 feed") return FEED_24_7.has(t);
        return true;
      }),
    [f, q]
  );
  const move = (e: React.MouseEvent<HTMLDivElement>) => {
    const b = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty("--mx", `${e.clientX - b.left}px`);
    e.currentTarget.style.setProperty("--my", `${e.clientY - b.top}px`);
  };
  return (
    <div>
      <div data-r className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((x) => (
            <button
              key={x}
              onClick={() => setF(x)}
              className={`h-10 rounded-full border px-5 text-sm ${f === x ? "border-signal-500 bg-signal-500 text-ink-950" : "border-ink-700 text-slate-300 hover:border-signal-500"}`}
            >
              {x}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-5">
          <span className="mono-label">{list.length} / 36</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search ticker or name"
            aria-label="Search ticker or name"
            className="h-10 w-full rounded-full border border-ink-700 bg-ink-950 px-5 text-sm outline-none placeholder:text-slate-500 focus:border-signal-500 lg:w-64"
          />
        </div>
      </div>
      <div onMouseMove={move} className="spot-grid grid grid-cols-2 gap-px sm:grid-cols-3 lg:grid-cols-6">
        {list.map((t, i) => {
          const etf = ETFS.has(t);
          return (
            <div key={t} style={{ animationDelay: `${Math.min(i, 24) * 25}ms` }} className="tile-in flex min-h-[176px] flex-col justify-between bg-ink-900/90 p-5 hover:bg-ink-800/80">
              <div className="flex items-start justify-between">
                <Monogram t={t} size={36} />
                {FEED_24_7.has(t) && (
                  <span className="mono-label flex items-center gap-2 !text-pos-500">
                    <span className="h-1.5 w-1.5 rounded-full bg-pos-500" />24/7
                  </span>
                )}
              </div>
              <div>
                <p className="font-mono text-2xl font-medium">{t}</p>
                <p className="mt-1 truncate text-sm text-slate-300">{NAMES[t]}</p>
                <div className="mt-4 flex items-center gap-3">
                  <span className="mono-label !text-slate-500">{etf ? "ETF" : "Stock"}</span>
                  <span className="h-px flex-1 bg-ink-700"><span className="block h-px bg-signal-500" style={{ width: etf ? "50%" : "100%" }} /></span>
                  <span className="mono-label !text-signal-500">IM {etf ? 10 : 20}%</span>
                </div>
              </div>
            </div>
          );
        })}
        {list.length === 0 && <p className="col-span-full bg-ink-900 p-10 text-slate-300">No match.</p>}
      </div>
    </div>
  );
}
