"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPublicClient, createWalletClient, custom, http, type Address, type EIP1193Provider } from "viem";
import { CHAIN_ID, CHAIN_NAME, EXPLORER, RPC_URL, chain } from "@/lib/chain";

// EIP-6963 wallet discovery, no wallet SDK. See https://eips.ethereum.org/EIPS/eip-6963
export type WalletInfo = { uuid: string; name: string; icon: string; rdns: string };
export type WalletDetail = { info: WalletInfo; provider: EIP1193Provider };

export const publicClient = createPublicClient({ chain, transport: http(RPC_URL) });

type Ctx = {
  wallets: WalletDetail[];
  active: WalletDetail | null;
  account: Address | null;
  chainId: number | null;
  wrongChain: boolean;
  connecting: boolean;
  error: string | null;
  connect: (w: WalletDetail) => Promise<void>;
  disconnect: () => void;
  switchChain: () => Promise<void>;
  walletClient: ReturnType<typeof createWalletClient> | null;
};

const WalletContext = createContext<Ctx | null>(null);
const STORE = "ch.wallet.rdns";
const hexChain = `0x${CHAIN_ID.toString(16)}`;

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [wallets, setWallets] = useState<WalletDetail[]>([]);
  const [active, setActive] = useState<WalletDetail | null>(null);
  const [account, setAccount] = useState<Address | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cleanup = useRef<(() => void) | null>(null);

  const attach = useCallback((w: WalletDetail) => {
    cleanup.current?.();
    const onAccounts = (a: unknown) => {
      const list = a as Address[];
      if (!list.length) {
        setAccount(null);
        setActive(null);
        localStorage.removeItem(STORE);
      } else setAccount(list[0]);
    };
    const onChain = (c: unknown) => setChainId(Number(c));
    w.provider.on("accountsChanged", onAccounts);
    w.provider.on("chainChanged", onChain);
    cleanup.current = () => {
      w.provider.removeListener("accountsChanged", onAccounts);
      w.provider.removeListener("chainChanged", onChain);
    };
  }, []);

  // Discover wallets.
  useEffect(() => {
    const onAnnounce = (e: Event) => {
      const d = (e as CustomEvent<WalletDetail>).detail;
      setWallets((prev) => (prev.some((p) => p.info.uuid === d.info.uuid) ? prev : [...prev, d]));
    };
    window.addEventListener("eip6963:announceProvider", onAnnounce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    return () => window.removeEventListener("eip6963:announceProvider", onAnnounce);
  }, []);

  // Silent reconnect (eth_accounts never opens a popup).
  useEffect(() => {
    if (active) return;
    const rdns = localStorage.getItem(STORE);
    const w = rdns ? wallets.find((x) => x.info.rdns === rdns) : undefined;
    if (!w) return;
    let cancelled = false;
    (async () => {
      try {
        const accs = (await w.provider.request({ method: "eth_accounts" })) as Address[];
        const cid = (await w.provider.request({ method: "eth_chainId" })) as string;
        if (cancelled || !accs.length) return;
        setActive(w);
        setAccount(accs[0]);
        setChainId(Number(cid));
        attach(w);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [wallets, active, attach]);

  const connect = useCallback(
    async (w: WalletDetail) => {
      setConnecting(true);
      setError(null);
      try {
        const accs = (await w.provider.request({ method: "eth_requestAccounts" })) as Address[];
        const cid = (await w.provider.request({ method: "eth_chainId" })) as string;
        setActive(w);
        setAccount(accs[0] ?? null);
        setChainId(Number(cid));
        localStorage.setItem(STORE, w.info.rdns);
        attach(w);
      } catch (e) {
        const err = e as { code?: number; message?: string };
        setError(err.code === 4001 ? "Connection request was rejected." : (err.message ?? "Could not connect."));
      } finally {
        setConnecting(false);
      }
    },
    [attach]
  );

  const disconnect = useCallback(() => {
    cleanup.current?.();
    cleanup.current = null;
    setActive(null);
    setAccount(null);
    setChainId(null);
    localStorage.removeItem(STORE);
  }, []);

  const switchChain = useCallback(async () => {
    if (!active) return;
    setError(null);
    try {
      await active.provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hexChain }] });
    } catch (e) {
      const err = e as { code?: number; message?: string };
      if (err.code === 4902 || err.code === -32603) {
        try {
          await active.provider.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: hexChain,
                chainName: CHAIN_NAME,
                nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
                rpcUrls: [RPC_URL], // public RPC only, never a keyed provider URL
                ...(EXPLORER ? { blockExplorerUrls: [EXPLORER] } : {}),
              },
            ],
          });
        } catch (e2) {
          setError((e2 as Error).message ?? "Could not add the network.");
        }
      } else if (err.code !== 4001) setError(err.message ?? "Could not switch network.");
    }
  }, [active]);

  const walletClient = useMemo(
    () => (active && account ? createWalletClient({ account, chain, transport: custom(active.provider) }) : null),
    [active, account]
  );

  const value: Ctx = {
    wallets,
    active,
    account,
    chainId,
    wrongChain: Boolean(account) && chainId !== CHAIN_ID,
    connecting,
    error,
    connect,
    disconnect,
    switchChain,
    walletClient,
  };
  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const c = useContext(WalletContext);
  if (!c) throw new Error("useWallet must be used inside WalletProvider");
  return c;
}
