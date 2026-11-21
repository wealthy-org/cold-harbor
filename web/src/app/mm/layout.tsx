import type { Metadata } from "next";
import { WalletProvider } from "@/components/app/WalletProvider";

export const metadata: Metadata = { title: "Cold Harbor | Market makers" };

export default function MmLayout({ children }: { children: React.ReactNode }) {
  return <WalletProvider>{children}</WalletProvider>;
}
