import type { Metadata } from "next";
import AppNav from "@/components/app/AppNav";
import { WalletProvider } from "@/components/app/WalletProvider";

export const metadata: Metadata = { title: "Cold Harbor | App" };

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <WalletProvider>
      <AppNav />
      {children}
    </WalletProvider>
  );
}
