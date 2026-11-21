import type { Metadata, Viewport } from "next";
import { Instrument_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const sans = Instrument_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans-body",
});
const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "----font-mono-label",
});

export const metadata: Metadata = {
  title: "Cold Harbor | On-chain OTC for tokenized stocks",
  description:
    "Firm quotes from competing market makers for tokenized US stocks on Robinhood Chain. Atomic settlement. Cash-settled forwards.",
  metadataBase: new URL("https://coldharbor.xyz"),
  openGraph: { title: "Cold Harbor", description: "Where size settles. On-chain OTC for tokenized US stocks.", type: "website" },
  twitter: { card: "summary_large_image" },
};
export const viewport: Viewport = { themeColor: "#0a0c12" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
