"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CHAIN_NAME, IS_MAINNET } from "@/lib/chain";
import ConnectButton from "./ConnectButton";

const TABS: { label: string; href?: string }[] = [
  { label: "Trade", href: "/app/trade" },
  { label: "Forwards", href: "/app/forwards" },
  { label: "Portfolio", href: "/app/portfolio" },
];

export default function AppNav() {
  const path = usePathname();
  return (
    <header className="sticky top-0 z-40 border-b border-ink-700 bg-ink-950">
      <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between px-8">
        <div className="flex items-center gap-12">
          <Link href="/" className="flex items-center gap-3">
            <Image src="/logo.png" alt="" width={30} height={30} />
            <span className="text-base font-semibold tracking-tight">Cold Harbor</span>
          </Link>
          <nav className="flex items-center gap-8">
            {TABS.map((t) =>
              t.href ? (
                <Link
                  key={t.label}
                  href={t.href}
                  className={`relative py-5 text-[15px] ${path.startsWith(t.href) ? "text-mist-100" : "text-slate-300 hover:text-mist-100"}`}
                >
                  {t.label}
                  {path.startsWith(t.href) && <span className="absolute inset-x-0 bottom-0 h-px bg-signal-500" />}
                </Link>
              ) : (
                <span key={t.label} className="flex items-center gap-2 py-5 text-[15px] text-slate-500">
                  {t.label}
                  <span className="mono-label !text-[10px] border border-ink-700 px-1.5 py-0.5">Soon</span>
                </span>
              ),
            )}
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <span className="mono-label hidden items-center gap-2 lg:flex">
            <span className={`h-1.5 w-1.5 rounded-full ${IS_MAINNET ? "bg-pos-500" : "bg-signal-500"}`} />
            {CHAIN_NAME}
          </span>
          <ConnectButton />
        </div>
      </div>
    </header>
  );
}
