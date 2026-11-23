"use client";

import { useState } from "react";
import {
  RfqMotif,
  ForwardMotif,
  LiquidityMotif,
  SettlementMotif,
  ApiMotif,
} from "@/components/Motifs";

type ServiceItem = {
  id: string;
  tag: string;
  title: string;
  headline: string;
  description: string;
  badges: string[];
  href: string;
  cta: string;
  Motif: React.ComponentType;
};

const SERVICES: ServiceItem[] = [
  {
    id: "otc",
    tag: "01 · SPOT BLOCK RFQ",
    title: "OTC Spot Block",
    headline: "Trade at the source of liquidity without AMM slippage.",
    description:
      "Execute $50K to $5M in tokenized US equities with guaranteed prices from competing market makers. Signed EIP-712 quotes settle atomically in a single contract call or completely revert.",
    badges: ["Signed firm quotes", "Private taker broadcast", "15–30s expiry", "1-tx atomic swap"],
    href: "/app/trade",
    cta: "Trade Spot Block",
    Motif: RfqMotif,
  },
  {
    id: "forwards",
    tag: "02 · DERIVATIVES",
    title: "Cash-Settled Forwards",
    headline: "Directional exposure and flexible tenors collateralized in USDG.",
    description:
      "Take Long or Short positions on tokenized equities with custom settlement dates. Settle against official NYSE/Nasdaq close prices observed by Chainlink oracles with automated keeper liquidations.",
    badges: ["1 week to 3 months", "USDG collateralized", "Oracle-verified close", "Capital efficient"],
    href: "/app/forwards",
    cta: "Open Forward Position",
    Motif: ForwardMotif,
  },
  {
    id: "liquidity",
    tag: "03 · LIQUIDITY PROVISION",
    title: "Liquidity Provision",
    headline: "Capture high-volume, non-toxic taker order flow.",
    description:
      "Create liquid, efficient markets for tokenized equities. Stream quotes over low-latency WebSocket (/mm/ws) and hedge inventory natively on Arcus perps or Lighter on the same chain.",
    badges: ["Low-latency WebSocket", "Bilateral firm quotes", "Same-chain hedging", "Arcus & Lighter"],
    href: "/mm",
    cta: "Provide Liquidity",
    Motif: LiquidityMotif,
  },
  {
    id: "settlement",
    tag: "04 · ON CHAIN SETTLEMENT",
    title: "On Chain Settlement",
    headline: "Where size settles without counterparty credit risk.",
    description:
      "No ISDA agreements, no prime brokerage counterparty insolvency risk. All settlement is executed directly by audited smart contracts on Robinhood Chain. Verified on-chain source code with zero critical findings.",
    badges: ["Slither static analysis verified", "ERC-1271 contract support", "Permissionless verification", "All-or-revert atomic swap"],
    href: "/docs",
    cta: "View Contract Reference",
    Motif: SettlementMotif,
  },
  {
    id: "api",
    tag: "05 · ALGORITHMIC TRADING",
    title: "Algorithmic Trading & API",
    headline: "Institutional infrastructure built for automated quoting desks.",
    description:
      "High-throughput EIP-712 typed quote validation, automated keeper liquidation, and granular risk limits per ticker and per counterparty. Complete programmatic access for market makers.",
    badges: ["WebSocket RFQ stream", "Registered hot signers", "Isolated margin vault", "EIP-712 typing"],
    href: "/mm",
    cta: "Connect Quoting Engine",
    Motif: ApiMotif,
  },
];

export default function ServicesAccordion() {
  const [activeId, setActiveId] = useState("otc");
  const activeService = SERVICES.find((s) => s.id === activeId) || SERVICES[0];

  return (
    <div className="grid grid-cols-12 items-center gap-8 lg:gap-14">
      {/* Left side: Interactive List (01 - 05) */}
      <div className="col-span-12 lg:col-span-7">
        <div className="divide-y divide-ink-700/80 border-b border-t border-ink-700/80">
          {SERVICES.map((s, idx) => {
            const isActive = s.id === activeId;
            return (
              <div
                key={s.id}
                onMouseEnter={() => setActiveId(s.id)}
                onClick={() => setActiveId(s.id)}
                className="group cursor-pointer py-6 transition-all duration-200 lg:py-7"
              >
                <div className="flex items-baseline justify-between">
                  <div className="flex items-baseline gap-4">
                    <span className="font-mono text-xs uppercase tracking-wider text-slate-500">
                      0{idx + 1}
                    </span>
                    <h3
                      className={`text-2xl font-semibold tracking-tight transition-colors duration-200 lg:text-3xl ${
                        isActive ? "text-signal-500" : "text-mist-100 group-hover:text-slate-300"
                      }`}
                    >
                      {s.title}
                    </h3>
                  </div>
                  <span
                    className={`font-mono text-sm transition-transform duration-200 ${
                      isActive ? "translate-x-1.5 text-signal-500" : "text-slate-600 group-hover:text-slate-400"
                    }`}
                  >
                    →
                  </span>
                </div>

                {/* Expanding text container */}
                <div
                  className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${
                    isActive ? "grid-rows-[1fr] opacity-100 pt-4" : "grid-rows-[0fr] opacity-0"
                  }`}
                >
                  <div className="overflow-hidden pl-8">
                    <p className="text-base font-medium text-slate-200">{s.headline}</p>
                    <p className="mt-2 text-sm leading-relaxed text-slate-400">{s.description}</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {s.badges.map((b) => (
                        <span
                          key={b}
                          className="rounded border border-ink-700 bg-ink-950 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-slate-300"
                        >
                          {b}
                        </span>
                      ))}
                    </div>
                    <div className="mt-5">
                      <a
                        href={s.href}
                        className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-[0.1em] text-signal-500 hover:text-signal-300"
                      >
                        <span>{s.cta}</span>
                        <span>→</span>
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right side: Vertically Centered Live Preview Card */}
      <div className="col-span-12 lg:col-span-5 flex items-center justify-center">
        <div className="w-full min-h-[480px] flex flex-col justify-between border border-ink-700 bg-[#0c0f18] p-6 sm:p-8 shadow-2xl transition-all duration-300 relative overflow-hidden rounded-sm hover:border-signal-500/50">
          {/* Top Card Header */}
          <div className="flex items-center justify-between border-b border-ink-700/80 pb-4">
            <span className="font-mono text-xs uppercase tracking-[0.1em] text-signal-500 font-bold">
              {activeService.tag}
            </span>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-signal-500 animate-pulse shadow-[0_0_8px_rgba(255,176,32,0.8)]" />
              <span className="rounded border border-ink-700 bg-ink-950 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-slate-300">
                Live Preview
              </span>
            </div>
          </div>

          {/* Dynamic 3D Matrix Motion Graphic Container */}
          <div className="my-4 flex h-64 sm:h-72 items-center justify-center p-2 overflow-hidden relative">
            <div key={activeService.id} className="anim-slide-up h-full w-full flex items-center justify-center">
              <activeService.Motif />
            </div>
          </div>

          {/* Bottom Card Footer with Direct Launch */}
          <div className="border-t border-ink-700/80 pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-mono text-xs font-semibold uppercase tracking-wider text-mist-100">
                  {activeService.title}
                </p>
                <p className="mt-0.5 text-xs text-slate-400">On Chain non-custodial software</p>
              </div>
              <a
                href={activeService.href}
                className="group inline-flex h-9 w-9 items-center justify-center rounded-full border border-ink-700 bg-ink-950 text-signal-500 transition-all hover:border-signal-500 hover:bg-signal-500 hover:text-ink-950 hover:scale-105"
                aria-label={`Open ${activeService.title}`}
              >
                <span className="transition-transform duration-200 group-hover:translate-x-0.5">→</span>
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
