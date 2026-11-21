import Image from "next/image";
import HeroField from "@/components/HeroField";
import { PillButton, SectionHead } from "@/components/ui";
import { RfqMotif, ForwardMotif, ApiMotif } from "@/components/Motifs";
import CtaScene from "@/components/CtaScene";
import Monogram from "@/components/Monogram";
import Markets from "@/components/Markets";
import Faq from "@/components/Faq";
import Reveal from "@/components/Reveal";
import CountUp from "@/components/CountUp";
import { TICKERS } from "@/lib/universe";

const NAV = [
  ["Products", "#products"],
  ["How it works", "#how"],
  ["Markets", "#markets"],
  ["Market makers", "#makers"],
  ["FAQ", "#faq"],
  ["Docs", "/docs"],
];

function TopNav() {
  return (
    <header className="sticky top-0 z-40 border-b border-ink-700 bg-ink-950">
      <div className="mx-auto flex h-[72px] max-w-[1440px] items-center justify-between px-4 lg:h-24 lg:px-16">
        <a href="#top" className="flex items-center gap-3">
          <Image src="/logo.png" alt="" width={36} height={36} priority />
          <span className="text-lg font-semibold tracking-tight">Cold Harbor</span>
        </a>
        <nav className="hidden gap-9 text-[15px] text-slate-300 lg:flex">
          {NAV.map(([label, href]) => (
            <a key={href} href={href} className="hover:text-signal-500">
              {label}
            </a>
          ))}
        </nav>
        <PillButton href="/app">Launch app</PillButton>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section id="top" className="relative overflow-hidden border-b border-ink-700">
      <HeroField />
      <div className="hero-in relative mx-auto flex min-h-[calc(100svh-96px)] max-w-[1440px] flex-col justify-center px-4 py-16 lg:px-16">
        <p className="mono-label mb-8">On-chain OTC · Robinhood Chain · 24/7</p>
        <h1 className="h1-display max-w-[20ch]">
          Shipping size through <span className="whitespace-nowrap text-signal-500">on-chain</span> markets
        </h1>
        <p className="mt-8 max-w-xl text-lg leading-relaxed text-slate-300">
          Firm quotes from competing market makers for tokenized US stocks on
          Robinhood Chain. One transaction. No slippage.
        </p>
        <div className="mt-10 flex flex-wrap gap-4">
          <PillButton href="/app">Request a quote</PillButton>
          <PillButton href="#makers" variant="ghost">
            Become a market maker
          </PillButton>
        </div>
        <p className="mono-label mt-14 !text-slate-500">Where size settles.</p>
      </div>
    </section>
  );
}

function TickerStrip() {
  const row = [...TICKERS, ...TICKERS];
  return (
    <div className="ticker-wrap overflow-hidden border-b border-ink-700 bg-ink-900 py-5" aria-label="Launch universe">
      <div className="ticker-track flex gap-10">
        {row.map((t, i) => (
          <span key={i} className="flex items-center gap-3 font-mono text-sm uppercase tracking-[0.08em] text-mist-100">
            <Monogram t={t} size={28} />
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}

function Facts() {
  const facts: [React.ReactNode, string][] = [
    [<CountUp key="n" value={36} />, "Stocks and ETFs at launch"],
    [<CountUp key="c" value={4663} />, "Robinhood Chain mainnet ID"],
    ["1 tx", "Atomic settlement, all or revert"],
    ["16:00 NY", "Official close sets forward price"],
  ];
  return (
    <section className="border-b border-ink-700">
      <dl className="mx-auto grid max-w-[1440px] grid-cols-2 px-4 lg:grid-cols-4 lg:px-16">
        {facts.map(([n, l], i) => (
          <div
            key={i}
            className={`py-10 lg:py-14 ${i > 0 ? "lg:border-l lg:border-ink-700 lg:pl-10" : ""}`}
          >
            <dt className="font-mono text-4xl font-medium text-signal-500 lg:text-5xl">{n}</dt>
            <dd className="mono-label mt-3 max-w-[18ch]">{l}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

const PRODUCTS = [
  { name: "Block RFQ", Motif: RfqMotif,
    line: "Ask several makers for one firm price on $50K to $5M of a stock token. Execute against the best signed quote. Tokens swap and the fee is taken in a single transaction, or everything reverts.",
    facts: ["EIP-712 signed quotes", "Private to your wallet", "15 to 30 second validity"] },
  { name: "Forwards", Motif: ForwardMotif,
    line: "Long or short a stock on a date you pick, collateralized in USDG. Maturity is an official US market close. The price is read from Chainlink with Pyth Pro as backup, and anyone can audit it.",
    facts: ["1 week to 3 months", "10K to 1M USDG per position", "Margin calls and keeper liquidation"] },
  { name: "Maker API", Motif: ApiMotif,
    line: "Stream RFQs over WebSocket, answer with signed quotes, hedge on Arcus or Lighter, and track hit rate and exposure per ticker. Set limits per ticker and per taker.",
    facts: ["WebSocket RFQ stream", "Registered hot signers", "Limits and margin vault"] },
];

function Products() {
  return (
    <section id="products" className="border-b border-ink-700">
      <div className="mx-auto max-w-[1440px] px-4 py-24 lg:px-16 lg:py-36">
        <SectionHead index="01" label="Products" title="Built for size. Priced by makers. Settled by contract." />
        <div>
          {PRODUCTS.map((p, i) => (
            <article key={p.name} data-r className="group relative grid grid-cols-12 items-center gap-x-8 gap-y-8 py-12 lg:py-16">
              <span className="draw absolute left-0 right-0 top-0 h-px bg-ink-700" />
              <span className="outline-num col-span-12 font-mono text-7xl font-medium leading-none lg:col-span-2 lg:text-8xl">0{i + 1}</span>
              <div className="col-span-12 lg:col-span-5">
                <h3 className="text-3xl font-semibold tracking-tight lg:text-4xl">{p.name}</h3>
                <p className="mt-5 max-w-md leading-relaxed text-slate-300">{p.line}</p>
                <ul className="mt-7 flex flex-wrap gap-2">
                  {p.facts.map((f) => (
                    <li key={f} className="rounded-full border border-ink-700 px-4 py-1.5 font-mono text-xs uppercase tracking-[0.06em] text-slate-300">{f}</li>
                  ))}
                </ul>
              </div>
              <div className="panel col-span-12 h-52 border border-ink-700 bg-ink-900 p-5 lg:col-span-5 lg:h-64">
                <p className="mono-label mb-2 !text-slate-500">Illustration</p>
                <div className="h-[calc(100%-1.5rem)]"><p.Motif /></div>
              </div>
            </article>
          ))}
          <div className="h-px bg-ink-700" />
        </div>
      </div>
    </section>
  );
}

function How() {
  const steps = [
    ["01", "Request", "Pick a ticker, a side and a size. Cold Harbor broadcasts the request to every registered maker at once."],
    ["02", "Compare", "Signed quotes arrive within seconds. The best one is shown next to the oracle price, with the number of makers who responded."],
    ["03", "Settle", "Approve, sign, confirm. The contract checks signature, expiry and nonce, then moves both sides in one transaction."],
  ];
  return (
    <section id="how" className="border-b border-ink-700 bg-paper-50 text-ink-950">
      <div className="mx-auto max-w-[1440px] px-4 py-24 lg:px-16 lg:py-36">
        <div data-r className="mb-16 lg:mb-24">
          <p className="mono-label mb-6 flex items-center gap-4 !text-slate-500">
            <span className="text-ink-950">02</span><span className="h-px w-10 bg-ink-950/30" />How it works
          </p>
          <h2 className="max-w-[16ch] text-[2.2rem] font-semibold leading-[1.05] tracking-[-0.025em] lg:text-[3.6rem]">Three steps from request to fill.</h2>
        </div>
        <ol className="grid grid-cols-1 gap-14 lg:grid-cols-3 lg:gap-10">
          {steps.map(([n, t, d]) => (
            <li key={n} data-r className="relative pt-8">
              <span className="draw absolute left-0 right-0 top-0 h-px bg-ink-950" />
              <span className="absolute -top-[5px] left-0 h-[11px] w-[11px] bg-signal-500" />
              <span className="font-mono text-8xl font-medium leading-none tracking-tighter lg:text-[9rem]" style={{ WebkitTextStroke: "1px #0a0c12", color: "transparent" }}>{n}</span>
              <h3 className="mt-8 text-3xl font-semibold tracking-tight">{t}</h3>
              <p className="mt-4 max-w-sm leading-relaxed text-ink-700">{d}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Traded() {
  const people = [
    ["On-chain traders", "$50K to $5M of a stock token at a firm price, without AMM slippage."],
    ["Funds and treasuries", "US equity exposure around the clock, or a hedge, without holding the token."],
    ["Market makers", "Large, non-toxic order flow, quoted from your own engine."],
    ["Integrators", "Firm liquidity for wallets and aggregators through a public API. Phase 2."],
  ];
  const why = ["Signed, firm quotes", "One-transaction settlement", "Makers compete per request", "Settlement from public oracles", "Self-custody", "RFQ open 24/7"];
  const loop = [...why, ...why];
  return (
    <section className="border-b border-ink-700">
      <div className="mx-auto max-w-[1440px] px-4 pt-24 lg:px-16 lg:pt-36">
        <SectionHead index="03" label="Traded by" title="Desks that move size, not noise." />
        <div className="grid grid-cols-1 gap-px bg-ink-700 sm:grid-cols-2 lg:grid-cols-4">
          {people.map(([t, d], i) => (
            <div key={t} data-r className="bg-ink-950 p-8 lg:p-10 lg:min-h-[300px]">
              <p className="font-mono text-sm text-signal-500">0{i + 1}</p>
              <h3 className="mt-16 text-2xl font-semibold tracking-tight">{t}</h3>
              <p className="mt-4 leading-relaxed text-slate-300">{d}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="ticker-wrap mt-24 overflow-hidden border-t border-ink-700 py-10 lg:mt-36 lg:py-14">
        <div className="marquee flex gap-16">
          {loop.map((w, i) => (
            <span key={i} className="flex items-center gap-16 whitespace-nowrap text-4xl font-semibold tracking-tight text-mist-100 lg:text-6xl">
              {w}<span className="h-3 w-3 bg-signal-500" aria-hidden />
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

function MarketsSection() {
  return (
    <section id="markets" className="border-b border-ink-700 bg-ink-900">
      <div className="mx-auto max-w-[1440px] px-4 py-24 lg:px-16 lg:py-36">
        <SectionHead index="04" label="Markets" title="36 tokenized stocks and ETFs at launch." />
        <Markets />
        <p className="mt-6 max-w-3xl text-sm leading-relaxed text-slate-500">
          Source: Chainlink Reference Data Directory, Robinhood Chain mainnet. IM is the proposed initial margin
          and may change. Green dot marks tickers with a 24/7 feed. Token addresses come from the official Robinhood registry.
        </p>
      </div>
    </section>
  );
}

const PAYLOAD = `{
  "type": "rfq.request",
  "product": "spot",
  "chainId": 4663,
  "baseToken": { "symbol": "NVDA", "decimals": 18 },
  "quoteToken": { "symbol": "USDG", "decimals": 6 },
  "side": "BUY",
  "oracleRef": { "source": "chainlink" },
  "feeBps": 8,
  "quoteDeadlineMs": 1500,
  "minExpirySec": 20
}`;

function Makers() {
  const steps = ["Whitelist your signer address", "Receive an API key", "Deposit USDG margin", "Set limits per ticker and per taker"];
  return (
    <section id="makers" className="border-b border-ink-700">
      <div className="mx-auto grid max-w-[1440px] grid-cols-12 gap-x-0 gap-y-16 lg:gap-x-10 px-4 py-24 lg:px-16 lg:py-36">
        <div data-r className="col-span-12 min-w-0 lg:col-span-5">
          <p className="mono-label mb-6 flex items-center gap-4"><span className="text-signal-500">05</span><span className="h-px w-10 bg-ink-700" />Market makers</p>
          <h2 className="text-[2.2rem] font-semibold leading-[1.05] tracking-[-0.025em] lg:text-[3.6rem]">Quote large flow. Hedge where you already trade.</h2>
          <p className="mt-6 max-w-md leading-relaxed text-slate-300">Hedge on Arcus perps or Lighter on the same chain. Keep your limits, your signer and your pricing logic.</p>
          <ol className="mt-10 border-t border-ink-700">
            {steps.map((s, i) => (
              <li key={s} className="flex items-baseline gap-6 border-b border-ink-700 py-5">
                <span className="font-mono text-signal-500">0{i + 1}</span><span className="text-lg">{s}</span>
              </li>
            ))}
          </ol>
          <div className="mt-10"><PillButton href="/mm">Apply as a maker</PillButton></div>
        </div>
        <div data-r className="col-span-12 min-w-0 lg:col-span-7">
          <div className="panel border border-ink-700 bg-ink-900">
            <div className="flex items-center justify-between border-b border-ink-700 px-6 py-4">
              <span className="mono-label !text-mist-100">rfq.request</span>
              <span className="mono-label">WebSocket /mm/ws</span>
            </div>
            <pre className="overflow-x-auto p-6 font-mono text-[13px] leading-7 text-slate-300 lg:p-8 lg:text-sm">
              <code>{PAYLOAD}</code>
            </pre>
            <div className="mono-label border-t border-ink-700 px-6 py-4">Reply with quote.submit and an EIP-712 signature</div>
          </div>
        </div>
      </div>
    </section>
  );
}

const FAQ = [
  ["Who holds my tokens?", "You do. Cold Harbor is non-custodial. Tokens move only inside the settlement transaction, and only if every check passes."],
  ["What happens if a quote expires?", "The contract rejects it. Quotes carry an expiry and a one-time nonce, and a maker can cancel a nonce at any time."],
  ["How is a forward priced at maturity?", "From the Chainlink feed at the official US close, with Pyth Pro as backup. If no valid price exists, settlement is deferred and anyone can retry."],
  ["What about splits and other corporate actions?", "Stock tokens expose a multiplier and the feed already reflects it. While an action is processing, settlement and liquidation pause and the app says so."],
  ["Are cash dividends adjusted in forwards?", "Not in the first release. Makers price expected dividends into the strike. This is still being confirmed against Robinhood documentation."],
];

function FaqSection() {
  return (
    <section id="faq" className="border-b border-ink-700">
      <div className="mx-auto max-w-[1440px] px-4 py-24 lg:px-16 lg:py-36">
        <SectionHead index="06" label="FAQ" title="Questions desks ask first." />
        <Faq items={FAQ} />
      </div>
    </section>
  );
}

function Cta() {
  return (
    <section id="cta" className="relative overflow-hidden border-b border-ink-700">
      <div className="mx-auto grid max-w-[1440px] grid-cols-12 items-center gap-x-0 gap-y-14 lg:gap-x-10 px-4 pb-10 pt-24 lg:px-16 lg:pt-36">
        <div data-r className="col-span-12 lg:col-span-6">
          <p className="mono-label mb-8 flex items-center gap-4"><span className="h-px w-10 bg-signal-500" />Start trading size</p>
          <h2 className="text-[3.2rem] font-semibold leading-[0.95] tracking-[-0.035em] lg:text-[6.4rem]">
            Where size <span className="text-signal-500">settles.</span>
          </h2>
          <p className="mt-8 max-w-md text-lg leading-relaxed text-slate-300">
            Request a firm quote, or plug in your own quoting engine. Mainnet opens to whitelisted traders and makers first.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-4">
            <PillButton href="/app">Launch app</PillButton>
            <PillButton href="/mm" variant="ghost">Apply as a maker</PillButton>
          </div>
        </div>
        <div data-r className="col-span-12 h-[300px] lg:col-span-6 lg:h-[440px]"><CtaScene /></div>
      </div>
      <div aria-hidden className="select-none whitespace-nowrap px-4 text-center font-semibold leading-[0.8] tracking-[-0.05em] lg:px-16" style={{ fontSize: "clamp(3rem, 12.4vw, 13rem)", color: "#161a24", maskImage: "linear-gradient(to bottom, #000 25%, transparent 92%)" }}>
        COLD HARBOR
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="bg-ink-950">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-8 px-4 py-12 lg:flex-row lg:items-center lg:justify-between lg:px-16">
        <div className="flex items-center gap-3">
          <Image src="/logo.png" alt="" width={28} height={28} />
          <span className="font-semibold">Cold Harbor</span>
        </div>
        <nav className="mono-label flex flex-wrap gap-x-8 gap-y-3">
          {[["Products", "#products"], ["Markets", "#markets"], ["Market makers", "#makers"], ["FAQ", "#faq"], ["Docs", "/docs"]].map(([l, h]) => (
            <a key={l} href={h} className="hover:text-signal-500">
              {l}
            </a>
          ))}
        </nav>
      </div>
      <p className="mx-auto max-w-[1440px] px-4 pb-10 text-xs leading-relaxed text-slate-500 lg:px-16">
        Cold Harbor is non-custodial software. Tokenized stocks and forwards carry risk, including
        loss of margin. Nothing here is investment advice.
      </p>
    </footer>
  );
}

export default function Home() {
  return (
    <>
      <TopNav />
      <main>
        <Reveal />
        <Hero />
        <TickerStrip />
        <Facts />
        <Products />
        <How />
        <Traded />
        <MarketsSection />
        <Makers />
        <FaqSection />
        <Cta />
      </main>
      <Footer />
    </>
  );
}
