"use client";
import { useState } from "react";

export default function Faq({ items }: { items: string[][] }) {
  const [open, setOpen] = useState(0);
  return (
    <div className="border-t border-ink-700">
      {items.map(([q, a], i) => {
        const on = open === i;
        return (
          <div key={q} data-r className="border-b border-ink-700">
            <button
              onClick={() => setOpen(on ? -1 : i)}
              aria-expanded={on}
              className="flex w-full items-center justify-between gap-8 py-7 text-left"
            >
              <span className="flex items-baseline gap-6">
                <span className="mono-label hidden lg:inline">0{i + 1}</span>
                <span className={`text-2xl tracking-tight lg:text-3xl ${on ? "text-signal-500" : "text-mist-100"}`}>{q}</span>
              </span>
              <span className={`relative h-8 w-8 shrink-0 rounded-full border ${on ? "border-signal-500" : "border-ink-700"}`} aria-hidden>
                <span className="absolute left-2 right-2 top-1/2 h-px bg-signal-500" />
                <span className={`absolute bottom-2 top-2 left-1/2 w-px bg-signal-500 transition-transform duration-500 ${on ? "scale-y-0" : ""}`} />
              </span>
            </button>
            <div className={`grid transition-[grid-template-rows] duration-500 ease-out ${on ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
              <div className="overflow-hidden">
                <p className="max-w-2xl pb-8 text-lg leading-relaxed text-slate-300 lg:pl-[3.2rem]">{a}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
