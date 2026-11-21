"use client";

import { useCallback, useState } from "react";
import type { Abi, Address, Hash } from "viem";
import { explain } from "@/lib/forwards";
import { publicClient, useWallet } from "./WalletProvider";

export type Req = { address: Address; abi: Abi; functionName: string; args?: readonly unknown[] };

/** Runs one or more contract calls in order: simulate (so reverts show a readable reason), sign, wait for the receipt. */
export function useTx(onDone?: () => void) {
  const { account, walletClient } = useWallet();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hash, setHash] = useState<Hash | null>(null);

  const run = useCallback(
    async (label: string, reqs: Req[]) => {
      if (!account || !walletClient) {
        setError("Connect a wallet first.");
        return false;
      }
      setBusy(label);
      setError(null);
      try {
        let last: Hash | null = null;
        for (const r of reqs) {
          const sim = (await publicClient.simulateContract({ ...r, account } as never)) as unknown as { request: never };
          last = await walletClient.writeContract(sim.request);
          await publicClient.waitForTransactionReceipt({ hash: last });
        }
        setHash(last);
        onDone?.();
        return true;
      } catch (e) {
        setError(explain(e));
        return false;
      } finally {
        setBusy(null);
      }
    },
    [account, walletClient, onDone]
  );

  return { run, busy, error, hash, setError };
}
