"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Monogram from "@/components/Monogram";
import { NAMES, TICKERS } from "@/lib/universe";
import { fmtUsd } from "@/lib/quote";
import type { Ref } from "./hooks";

export default function TickerSelect({
  value,
  onChange,
  prices,
}: {
  value: string;
  onChange: (t: string) => void;
  prices: Record<string, Ref>;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, []);

  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

  const list = useMemo(() => {
    const s = q.trim().toUpperCase();
    return TICKERS.filter((t) => !s || t.includes(s) || NAMES[t].toUpperCase().includes(s));
  }, [q]);

  const pick = (t: string) => {
    onChange(t);
    setOpen(false);
    setQ("");
  };

  const p = prices[value];
  return (
    <div ref={box} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex h-16 w-full items-center justify-between border border-ink-700 bg-ink-950 px-4 text-left hover:border-signal-500"
      >
        <span className="flex items-center gap-4">
          <Monogram t={value} size={36} />
          <span>
            <span className="block font-mono text-lg font-medium leading-tight">{value}</span>
            <span className="block text-sm leading-tight text-slate-300">{NAMES[value]}</span>
          </span>
        </span>
        <span className="text-right">
          <span className="mono-label block !text-slate-500">Ref mid</span>
          <span className="block font-mono text-base">{p ? `$${fmtUsd(p.mid)}` : "…"}</span>
        </span>
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-[68px] z-30 border border-ink-700 bg-ink-900">
          <input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && list[0] && pick(list[0])}
            placeholder="Search ticker or name"
            className="h-12 w-full border-b border-ink-700 bg-transparent px-4 text-sm outline-none placeholder:text-slate-500"
          />
          <ul className="max-h-80 overflow-y-auto">
            {list.map((t) => (
              <li key={t}>
                <button
                  onClick={() => pick(t)}
                  className={`flex w-full items-center justify-between px-4 py-2.5 text-left hover:bg-ink-800 ${t === value ? "bg-ink-800" : ""}`}
                >
                  <span className="flex items-center gap-3">
                    <Monogram t={t} size={28} />
                    <span className="font-mono text-sm">{t}</span>
                    <span className="truncate text-sm text-slate-500">{NAMES[t]}</span>
                  </span>
                  <span className="font-mono text-sm text-slate-300">{prices[t] ? `$${fmtUsd(prices[t].mid)}` : ""}</span>
                </button>
              </li>
            ))}
            {list.length === 0 && <li className="px-4 py-6 text-sm text-slate-300">No match.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
