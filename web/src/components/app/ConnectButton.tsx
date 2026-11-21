"use client";

import { useEffect, useRef, useState } from "react";
import { CHAIN_NAME } from "@/lib/chain";
import { shortAddr } from "@/lib/quote";
import { useWallet } from "./WalletProvider";

export default function ConnectButton() {
  const { wallets, account, wrongChain, connecting, error, connect, disconnect, switchChain, active } = useWallet();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const openMenu = () => setOpen(true);
    window.addEventListener("ch:connect", openMenu);
    return () => window.removeEventListener("ch:connect", openMenu);
  }, []);

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

  const pill = "inline-flex h-10 items-center gap-3 rounded-full px-5 text-sm font-medium";

  if (account && wrongChain) {
    return (
      <button onClick={switchChain} className={`${pill} bg-signal-500 text-ink-950 hover:bg-signal-300`}>
        Switch to {CHAIN_NAME}
      </button>
    );
  }

  return (
    <div ref={box} className="relative">
      {account ? (
        <button onClick={() => setOpen((o) => !o)} className={`${pill} border border-ink-700 hover:border-signal-500`}>
          {active?.info.icon && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={active.info.icon} alt="" width={18} height={18} className="h-[18px] w-[18px] rounded-[4px]" />
          )}
          <span className="font-mono">{shortAddr(account)}</span>
        </button>
      ) : (
        <button onClick={() => setOpen((o) => !o)} disabled={connecting} className={`${pill} bg-signal-500 text-ink-950 hover:bg-signal-300 disabled:opacity-60`}>
          {connecting ? "Connecting" : "Connect wallet"}
        </button>
      )}

      {open && (
        <div className="absolute right-0 top-12 z-50 w-72 border border-ink-700 bg-ink-900 p-2">
          {account ? (
            <>
              <button
                className="flex w-full items-center justify-between px-3 py-3 text-left text-sm hover:bg-ink-800"
                onClick={async () => {
                  await navigator.clipboard.writeText(account);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1200);
                }}
              >
                <span className="font-mono text-slate-300">{shortAddr(account)}</span>
                <span className="mono-label">{copied ? "Copied" : "Copy"}</span>
              </button>
              <button
                className="w-full px-3 py-3 text-left text-sm text-neg-500 hover:bg-ink-800"
                onClick={() => {
                  disconnect();
                  setOpen(false);
                }}
              >
                Disconnect
              </button>
            </>
          ) : wallets.length === 0 ? (
            <p className="px-3 py-4 text-sm leading-relaxed text-slate-300">
              No browser wallet detected. Install a wallet such as MetaMask or Rabby, then reload this page.
            </p>
          ) : (
            <>
              <p className="mono-label px-3 py-2">Choose a wallet</p>
              {wallets.map((w) => (
                <button
                  key={w.info.uuid}
                  onClick={async () => {
                    await connect(w);
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-ink-800"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={w.info.icon} alt="" width={24} height={24} className="h-6 w-6 rounded-[6px]" />
                  <span className="text-sm">{w.info.name}</span>
                </button>
              ))}
            </>
          )}
          {error && <p className="px-3 py-2 text-xs text-neg-500">{error}</p>}
        </div>
      )}
    </div>
  );
}
