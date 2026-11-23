import Image from "next/image";
import HeroField from "@/components/HeroField";
import { PillButton, SectionHead } from "@/components/ui";
import CtaScene from "@/components/CtaScene";
import Monogram from "@/components/Monogram";
import Markets from "@/components/Markets";
import Faq from "@/components/Faq";
import Reveal from "@/components/Reveal";
import ServicesAccordion from "@/components/ServicesAccordion";
import AssetTickerBar from "@/components/AssetTickerBar";
import LiquidStats from "@/components/LiquidStats";
import { TICKERS, ETFS, FEED_24_7 } from "@/lib/universe";

function TopNav() {
  return (
    <header className="sticky top-0 z-50 border-b border-ink-700 bg-ink-950/90 backdrop-blur-md">
      <div className="mx-auto flex h-[72px] max-w-[1440px] items-center justify-between px-4 lg:h-20 lg:px-16">
        <a href="#top" className="flex items-center gap-3">
          <Image src="/logo.png" alt="" width={32} height={32} priority className="shrink-0" />
          <span className="font-mono text-base font-semibold tracking-[0.1em] uppercase text-mist-100">
            Cold Harbor
          </span>
        </a>

        {/* Wintermute-style Megamenu Navigation */}
        <nav className="hidden items-center gap-8 text-[13px] font-medium uppercase tracking-[0.08em] lg:flex">
          {/* OTC Dropdown */}
          <div className="group relative">
            <button className="flex items-center gap-1.5 py-2 text-slate-300 transition-colors group-hover:text-signal-500">
              OTC
              <svg className="h-3 w-3 text-slate-500 transition-transform duration-200 group-hover:rotate-180 group-hover:text-signal-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
            <div className="invisible absolute left-0 top-full w-80 translate-y-2 border border-ink-700 bg-ink-900 p-2 opacity-0 shadow-2xl transition-all duration-200 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100">
              <div className="border-b border-ink-700/60 p-2.5">
                <span className="mono-label !text-signal-500">Institutional OTC</span>
              </div>
              <a href="/app/trade" className="block rounded p-2.5 transition-colors hover:bg-ink-800">
                <p className="text-sm font-semibold tracking-normal text-mist-100">Spot Block RFQ</p>
                <p className="mt-1 text-xs normal-case leading-normal text-slate-400">$50K to $5M firm quote. 1-tx atomic settlement.</p>
              </a>
              <a href="/app/forwards" className="block rounded p-2.5 transition-colors hover:bg-ink-800">
                <p className="text-sm font-semibold tracking-normal text-mist-100">Cash-Settled Forwards</p>
                <p className="mt-1 text-xs normal-case leading-normal text-slate-400">USDG collateralized. Settled at official US close.</p>
              </a>
              <a href="/mm" className="block rounded p-2.5 transition-colors hover:bg-ink-800">
                <p className="text-sm font-semibold tracking-normal text-mist-100">WebSocket RFQ Stream</p>
                <p className="mt-1 text-xs normal-case leading-normal text-slate-400">Direct algorithmic quoting for market makers.</p>
              </a>
            </div>
          </div>

          {/* Liquidity Dropdown */}
          <div className="group relative">
            <button className="flex items-center gap-1.5 py-2 text-slate-300 transition-colors group-hover:text-signal-500">
              Liquidity
              <svg className="h-3 w-3 text-slate-500 transition-transform duration-200 group-hover:rotate-180 group-hover:text-signal-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
            <div className="invisible absolute left-0 top-full w-80 translate-y-2 border border-ink-700 bg-ink-900 p-2 opacity-0 shadow-2xl transition-all duration-200 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100">
              <div className="border-b border-ink-700/60 p-2.5">
                <span className="mono-label !text-signal-500">Execution Venues</span>
              </div>
              <a href="#how" className="block rounded p-2.5 transition-colors hover:bg-ink-800">
                <p className="text-sm font-semibold tracking-normal text-mist-100">Multi-MM RFQ Engine</p>
                <p className="mt-1 text-xs normal-case leading-normal text-slate-400">Competing market makers quote each order in parallel.</p>
              </a>
              <a href="#makers" className="block rounded p-2.5 transition-colors hover:bg-ink-800">
                <p className="text-sm font-semibold tracking-normal text-mist-100">RHC Ecosystem Hedging</p>
                <p className="mt-1 text-xs normal-case leading-normal text-slate-400">Same-chain hedging via Arcus perps & Lighter.</p>
              </a>
              <a href="/docs" className="block rounded p-2.5 transition-colors hover:bg-ink-800">
                <p className="text-sm font-semibold tracking-normal text-mist-100">Non-Custodial Architecture</p>
                <p className="mt-1 text-xs normal-case leading-normal text-slate-400">Settled On Chain by verified smart contracts.</p>
              </a>
            </div>
          </div>

          <a href="#markets" className="py-2 text-slate-300 transition-colors hover:text-signal-500">
            Markets
          </a>
          <a href="#whoweserve" className="py-2 text-slate-300 transition-colors hover:text-signal-500">
            Who we serve
          </a>
          <a href="#makers" className="py-2 text-slate-300 transition-colors hover:text-signal-500">
            Market makers
          </a>
          <a href="#faq" className="py-2 text-slate-300 transition-colors hover:text-signal-500">
            FAQ
          </a>
          <a href="/docs" className="py-2 text-slate-300 transition-colors hover:text-signal-500">
            Docs
          </a>
        </nav>

        <div className="flex items-center gap-3">
          <PillButton href="/app">Launch app</PillButton>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section id="top" className="relative overflow-hidden border-b border-ink-700">
      <HeroField />
      <div className="hero-in relative mx-auto flex min-h-[calc(100svh-120px)] max-w-[1440px] flex-col justify-center px-4 py-20 lg:px-16 lg:py-32">
        {/* Main Hero Content */}
        <div className="max-w-3xl">
          <div className="mb-6 flex items-center gap-3 font-mono text-xs uppercase tracking-[0.1em] text-slate-400">
            <span className="flex h-2 w-2 items-center justify-center">
              <span className="h-2 w-2 animate-ping rounded-full bg-signal-500 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-signal-500" />
            </span>
            <span>On Chain OTC desk · Robinhood Chain · 24/7 RFQ</span>
          </div>

          <h1 className="h1-display max-w-[20ch]">
            Harnessing <span className="text-signal-500">On Chain</span> liquidity in digital equity markets
          </h1>

          <p className="mt-8 max-w-2xl text-lg leading-relaxed text-slate-300 lg:text-xl">
            Cold Harbor makes tokenized US stock markets liquid and efficient.
            Firm quotes from competing market makers. Non-custodial, one-transaction
            atomic settlement with zero slippage.
          </p>

          <div className="mt-10 flex flex-wrap items-center gap-4">
            <PillButton href="/app/trade">Request a quote</PillButton>
            <PillButton href="/mm" variant="ghost">
              Become a market maker
            </PillButton>
          </div>
        </div>
      </div>
    </section>
  );
}


function TickerStrip() {
  const row = [...TICKERS, ...TICKERS];
  return (
    <div className="ticker-wrap overflow-hidden border-b border-ink-700 bg-ink-950 py-3.5 select-none" aria-label="Supported equity tokens">
      <div className="ticker-track flex items-center gap-4">
        {row.map((t, i) => (
          <a
            key={i}
            href={`/app/trade?base=${t}`}
            title={`Trade ${t} on Cold Harbor`}
            className="group/item flex shrink-0 items-center gap-2.5 rounded-full border border-ink-700/60 bg-ink-900/50 px-3.5 py-1.5 transition-all duration-200 hover:border-signal-500 hover:bg-ink-800/80 hover:shadow-[0_0_12px_rgba(255,176,32,0.25)] hover:scale-105"
          >
            <Monogram t={t} size={20} />
            <span className="font-mono text-xs font-bold uppercase tracking-wider text-mist-100 transition-colors group-hover/item:text-signal-500">
              {t}
            </span>
            {FEED_24_7.has(t) && (
              <span className="h-1.5 w-1.5 rounded-full bg-pos-500 animate-pulse shadow-[0_0_6px_rgba(34,197,94,0.8)]" title="24/7 Feed Active" />
            )}
            {ETFS.has(t) && (
              <span className="rounded bg-ink-800 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-slate-400">
                ETF
              </span>
            )}
          </a>
        ))}
      </div>
    </div>
  );
}

function CapabilitiesSection() {
  return (
    <section id="capabilities" className="border-b border-ink-700 bg-ink-950">
      <div className="mx-auto max-w-[1440px] px-4 py-24 lg:px-16 lg:py-32">
        <SectionHead
          index="01"
          label="Services & Capabilities"
          title="Trade at the source of On Chain equity liquidity."
        />
        {/* The Interactive Accordion from User Video (Frames 12-16) */}
        <ServicesAccordion />
      </div>
    </section>
  );
}

function How() {
  const steps = [
    [
      "01",
      "Request (RFQ)",
      "Pick a ticker, a side (Buy/Sell), and block size. Cold Harbor relays the request to every registered market maker simultaneously via private WebSocket.",
    ],
    [
      "02",
      "Quote Competition",
      "Makers return firm EIP-712 signed quotes within milliseconds. The engine ranks best price alongside Chainlink reference spread and expiry countdown.",
    ],
    [
      "03",
      "Atomic Settlement",
      "Approve and fill in one click. The smart contract validates signatures, checks nonces, and moves both assets in a single atomic transaction.",
    ],
  ];
  return (
    <section id="how" className="border-b border-ink-700 bg-ink-900">
      <div className="mx-auto max-w-[1440px] px-4 py-24 lg:px-16 lg:py-32">
        <div data-r className="mb-16 lg:mb-20">
          <p className="mono-label mb-6 flex items-center gap-4">
            <span className="text-signal-500">02</span>
            <span className="h-px w-10 bg-ink-700" />
            Execution Pipeline
          </p>
          <h2 className="max-w-[20ch] text-[2.2rem] font-semibold leading-[1.05] tracking-[-0.025em] text-mist-100 lg:text-[3.4rem]">
            Three steps from request to On Chain fill.
          </h2>
        </div>
        <ol className="grid grid-cols-1 gap-px bg-ink-700 lg:grid-cols-3">
          {steps.map(([n, t, d]) => (
            <li key={n} data-r className="bg-ink-950 p-8 lg:p-12">
              <span className="font-mono text-6xl font-medium leading-none text-ink-700 lg:text-7xl">{n}</span>
              <h3 className="mt-6 text-2xl font-semibold tracking-tight text-mist-100">{t}</h3>
              <p className="mt-4 leading-relaxed text-slate-300">{d}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function WhoWeServe() {
  const people = [
    [
      "01",
      "On Chain Traders & Whales",
      "Execute $50K to $5M block trades at a guaranteed price, protected from mempool front-running and AMM slippage.",
    ],
    [
      "02",
      "Funds & Crypto Treasuries",
      "Gain 24/7 institutional exposure to US equities or hedge treasury holdings without managing broker accounts or custody.",
    ],
    [
      "03",
      "Market Makers & APs",
      "Capture high-volume, non-toxic taker flow. Quote via your own pricing engine with native perps hedging on Arcus and Lighter.",
    ],
    [
      "04",
      "Integrators & Protocols",
      "Connect wallets, order routers, and liquidity aggregators directly to firm institutional RFQ streams. (Phase 2).",
    ],
  ];
  return (
    <section id="whoweserve" className="border-b border-ink-700 bg-ink-950">
      <div className="mx-auto max-w-[1440px] px-4 py-24 lg:px-16 lg:py-32">
        <SectionHead index="03" label="Who we serve" title="Dedicated trading solutions across On Chain markets." />
        <div className="grid grid-cols-1 gap-px bg-ink-700 sm:grid-cols-2 lg:grid-cols-4">
          {people.map(([n, t, d]) => (
            <div key={t} data-r className="wm-card bg-ink-900 p-8 lg:p-10 lg:min-h-[280px]">
              <span className="wm-marker" />
              <p className="font-mono text-xs uppercase tracking-wider text-signal-500">{n}</p>
              <h3 className="mt-8 text-xl font-semibold tracking-tight text-mist-100">{t}</h3>
              <p className="mt-3 text-sm leading-relaxed text-slate-400">{d}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function MarketsSection() {
  return (
    <section id="markets" className="border-b border-ink-700 bg-ink-900">
      <div className="mx-auto max-w-[1440px] px-4 py-24 lg:px-16 lg:py-32">
        <SectionHead index="04" label="Markets Universe" title="36 tokenized stocks and ETFs at launch." />
        <Markets />
        <p className="mt-6 max-w-3xl text-xs leading-relaxed text-slate-500">
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
  const steps = [
    "Whitelist your signer address with protocol governance",
    "Receive an API key for WebSocket authentication",
    "Deposit USDG margin in the non-custodial MarginVault",
    "Set risk limits per ticker and per counterparty",
  ];
  return (
    <section id="makers" className="border-b border-ink-700 bg-ink-950">
      <div className="mx-auto grid max-w-[1440px] grid-cols-12 gap-x-0 gap-y-16 px-4 py-24 lg:gap-x-12 lg:px-16 lg:py-32">
        <div data-r className="col-span-12 min-w-0 lg:col-span-5">
          <p className="mono-label mb-6 flex items-center gap-4">
            <span className="text-signal-500">05</span>
            <span className="h-px w-10 bg-ink-700" />
            Market makers
          </p>
          <h2 className="text-[2.2rem] font-semibold leading-[1.05] tracking-[-0.025em] text-mist-100 lg:text-[3.2rem]">
            Quote size flow. Keep your engine.
          </h2>
          <p className="mt-6 max-w-md leading-relaxed text-slate-300">
            Hedge on Arcus perps or Lighter on the same chain. Keep your limits, your registered hot signer, and your proprietary pricing logic.
          </p>
          <ol className="mt-8 border-t border-ink-700">
            {steps.map((s, i) => (
              <li key={s} className="flex items-baseline gap-4 border-b border-ink-700 py-4 text-sm text-slate-300">
                <span className="font-mono text-signal-500">0{i + 1}</span>
                <span>{s}</span>
              </li>
            ))}
          </ol>
          <div className="mt-8">
            <PillButton href="/mm">Apply to quote</PillButton>
          </div>
        </div>

        {/* Terminal Window */}
        <div data-r className="col-span-12 min-w-0 lg:col-span-7">
          <div className="border border-ink-700 bg-ink-900 shadow-2xl">
            <div className="flex items-center justify-between border-b border-ink-700 px-6 py-3.5">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-ink-700" />
                <span className="h-2.5 w-2.5 rounded-full bg-ink-700" />
                <span className="h-2.5 w-2.5 rounded-full bg-ink-700" />
                <span className="ml-2 font-mono text-xs uppercase tracking-wider text-slate-400">WebSocket /mm/ws</span>
              </div>
              <span className="font-mono text-xs text-signal-500">rfq.request</span>
            </div>
            <pre className="overflow-x-auto p-6 font-mono text-[13px] leading-6 text-slate-300 lg:p-8">
              <code>{PAYLOAD}</code>
            </pre>
            <div className="flex items-center justify-between border-t border-ink-700 px-6 py-3 font-mono text-xs text-slate-400">
              <span>Reply with quote.submit</span>
              <span className="text-signal-500">EIP-712 Signature Binding</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

{/* Wintermute Insights Cards from Video (Frame 18) */}
function InsightsSection() {
  const insights = [
    {
      label: "PROOFS",
      title: "200+ Verified Settlement Transactions",
      desc: "Every contract deployment, spot quote fill, and forward settlement on Robinhood Chain testnet is recorded On Chain with public transaction hashes.",
      href: "/docs",
      linkText: "View proof ledger →",
      accent: "border-t-2 border-t-signal-500",
    },
    {
      label: "GOVERNANCE & ORACLES",
      title: "NYSE & Nasdaq Calendar Synchronization",
      desc: "Settlement prices are anchored to official 16:00 ET close prices via Chainlink feeds with automated early-close and DST shift compensation.",
      href: "/docs",
      linkText: "Inspect oracle specs →",
      accent: "border-t-2 border-t-info-500",
    },
    {
      label: "SECURITY AUDIT",
      title: "Static Analysis Verified with Slither",
      desc: "All smart contracts underwent static security analysis. Zero High and Zero Medium severity findings detected across settlement and forwards engines.",
      href: "/docs",
      linkText: "Read security report →",
      accent: "border-t-2 border-t-pos-500",
    },
  ];
  return (
    <section id="insights" className="border-b border-ink-700 bg-ink-900">
      <div className="mx-auto max-w-[1440px] px-4 py-24 lg:px-16 lg:py-32">
        <SectionHead index="06" label="Insights & Verification" title="Institutional rigor. Provable On Chain." />
        <div className="grid grid-cols-1 gap-px bg-ink-700 lg:grid-cols-3">
          {insights.map((item) => (
            <div key={item.title} data-r className={`wm-card flex flex-col justify-between bg-ink-950 p-8 lg:p-10 ${item.accent}`}>
              <span className="wm-marker" />
              <div>
                <span className="font-mono text-xs uppercase tracking-wider text-signal-500">{item.label}</span>
                <h3 className="mt-6 text-xl font-semibold tracking-tight text-mist-100">{item.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-slate-400">{item.desc}</p>
              </div>
              <div className="mt-8 border-t border-ink-700/80 pt-4">
                <a href={item.href} className="font-mono text-xs uppercase tracking-[0.08em] text-signal-500 hover:text-signal-300">
                  {item.linkText}
                </a>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

{/* Wintermute Vibrant Full-Width Signal Banner from Video (Frame 18) */}
function ActionBanner() {
  const actions = [
    { title: "Request a quote →", desc: "TO ACCESS ON CHAIN OTC BLOCK LIQUIDITY", href: "/app/trade" },
    { title: "Become a maker →", desc: "TO STREAM RFQ QUOTES & EARN SPREAD", href: "/mm" },
    { title: "Explore docs →", desc: "TO AUDIT CONTRACTS & ON CHAIN PROOFS", href: "/docs" },
  ];
  return (
    <section className="bg-signal-500 text-ink-950">
      <div className="mx-auto grid max-w-[1440px] grid-cols-1 divide-y divide-ink-950/20 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {actions.map((act) => (
          <a
            key={act.title}
            href={act.href}
            className="group flex flex-col justify-between p-8 transition-colors hover:bg-signal-300 lg:p-12"
          >
            <span className="text-2xl font-bold tracking-tight lg:text-3xl transition-transform duration-200 group-hover:translate-x-1">
              {act.title}
            </span>
            <span className="mt-6 font-mono text-xs font-semibold uppercase tracking-wider text-ink-950/80">
              {act.desc}
            </span>
          </a>
        ))}
      </div>
    </section>
  );
}

const FAQ = [
  ["Who holds my tokens?", "You do. Cold Harbor is non-custodial software. Tokens move only inside the settlement transaction, and only if every check (signatures, expiry, nonce, balances) passes."],
  ["What happens if a quote expires?", "The smart contract rejects it. Quotes carry a strict timestamp expiry and a one-time nonce. A market maker can cancel nonces On Chain at any time."],
  ["How is a forward priced at maturity?", "From the official Chainlink feed at the official US equity close (16:00 ET), with Pyth Pro as secondary backup. If no valid price exists, settlement is deferred until market feeds resume."],
  ["What about corporate actions and stock splits?", "Tokenized stocks expose an On Chain multiplier and the Chainlink feed already reflects it. While an action is processing, settlement and liquidation pause until resolved."],
  ["Are cash dividends adjusted in forwards?", "Not in the first release. Market makers price expected forward dividends directly into the agreed strike."],
];

function FaqSection() {
  return (
    <section id="faq" className="border-b border-ink-700 bg-ink-950">
      <div className="mx-auto max-w-[1440px] px-4 py-24 lg:px-16 lg:py-32">
        <SectionHead index="07" label="FAQ" title="Questions desks ask first." />
        <Faq items={FAQ} />
      </div>
    </section>
  );
}

function Cta() {
  return (
    <section id="cta" className="relative overflow-hidden border-b border-ink-700 bg-ink-950">
      <div className="mx-auto grid max-w-[1440px] grid-cols-12 items-center gap-x-0 gap-y-14 px-4 pb-12 pt-24 lg:gap-x-12 lg:px-16 lg:pt-32">
        <div data-r className="col-span-12 lg:col-span-6">
          <p className="mono-label mb-6 flex items-center gap-4">
            <span className="h-px w-10 bg-signal-500" />
            Institutional Size OTC
          </p>
          <h2 className="text-[3rem] font-semibold leading-[0.95] tracking-[-0.035em] text-mist-100 lg:text-[5.5rem]">
            Where size <span className="text-signal-500">settles.</span>
          </h2>
          <p className="mt-6 max-w-md text-base leading-relaxed text-slate-300 lg:text-lg">
            Request a firm quote, or plug in your proprietary quoting engine. Experience atomic On Chain block execution on Robinhood Chain.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <PillButton href="/app">Launch app</PillButton>
            <PillButton href="/mm" variant="ghost">Apply to quote</PillButton>
          </div>
        </div>
        <div data-r className="col-span-12 h-[260px] lg:col-span-6 lg:h-[380px]">
          <CtaScene />
        </div>
      </div>
      <div
        aria-hidden
        className="select-none whitespace-nowrap px-4 text-center font-semibold leading-[0.8] tracking-[-0.05em] lg:px-16"
        style={{ fontSize: "clamp(3rem, 12.4vw, 12rem)", color: "#141720", maskImage: "linear-gradient(to bottom, #000 25%, transparent 92%)" }}
      >
        COLD HARBOR
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="bg-ink-950">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-10 px-4 py-16 lg:px-16">
        <div className="flex flex-col justify-between gap-8 border-b border-ink-700/80 pb-12 lg:flex-row lg:items-start">
          <div className="max-w-sm">
            <div className="flex items-center gap-3">
              <Image src="/logo.png" alt="" width={28} height={28} />
              <span className="font-mono text-base font-semibold tracking-wider uppercase text-mist-100">Cold Harbor</span>
            </div>
            <p className="mt-4 text-xs leading-relaxed text-slate-400">
              Institutional On Chain OTC desk and cash-settled forwards for tokenized US equities on Robinhood Chain.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-10 sm:grid-cols-3 lg:gap-16">
            <div>
              <p className="mono-label mb-3 !text-signal-500">Products</p>
              <ul className="space-y-2 text-xs text-slate-400">
                <li><a href="/app/trade" className="hover:text-signal-500">Spot Block RFQ</a></li>
                <li><a href="/app/forwards" className="hover:text-signal-500">Cash-Settled Forwards</a></li>
                <li><a href="/app/portfolio" className="hover:text-signal-500">Portfolio & Positions</a></li>
                <li><a href="#markets" className="hover:text-signal-500">Supported Markets</a></li>
              </ul>
            </div>
            <div>
              <p className="mono-label mb-3 !text-signal-500">Infrastructure</p>
              <ul className="space-y-2 text-xs text-slate-400">
                <li><a href="/mm" className="hover:text-signal-500">Market Maker Portal</a></li>
                <li><a href="#makers" className="hover:text-signal-500">WebSocket RFQ Stream</a></li>
                <li><a href="/docs" className="hover:text-signal-500">Contract Reference</a></li>
                <li><a href="/docs" className="hover:text-signal-500">Testnet Proofs</a></li>
              </ul>
            </div>
            <div>
              <p className="mono-label mb-3 !text-signal-500">Network & Legal</p>
              <ul className="space-y-2 text-xs text-slate-400">
                <li><span className="text-slate-500">Chain: Robinhood (46630)</span></li>
                <li><a href="https://x.com/coldharbororg" target="_blank" rel="noopener noreferrer" className="hover:text-signal-500">X (Twitter)</a></li>
                <li><a href="#faq" className="hover:text-signal-500">Protocol FAQ</a></li>
              </ul>
            </div>
          </div>
        </div>

        {/* Heavyweight Regulatory / Institutional Disclaimer */}
        <div className="space-y-3 text-[11px] leading-relaxed text-slate-500">
          <p>
            Cold Harbor is an autonomous, non-custodial smart contract protocol deployed on Robinhood Chain.
            Cold Harbor does not act as a broker, dealer, custodian, or counterparty to any trade. All spot transactions
            and cash-settled forwards execute atomically through immutable On Chain smart contracts.
          </p>
          <p>
            Trading tokenized stocks and derivative contracts involves significant market risk and may lead to loss of collateral.
            Nothing on this website constitutes financial, investment, or legal advice. Availability may be restricted by jurisdiction.
          </p>
          <p className="pt-2 font-mono text-[10px] text-slate-600">
            © 2026 Cold Harbor Protocol. All rights reserved.
          </p>
        </div>
      </div>
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
        <LiquidStats />
        <AssetTickerBar />
        <TickerStrip />
        <CapabilitiesSection />
        <How />
        <WhoWeServe />
        <MarketsSection />
        <Makers />
        <InsightsSection />
        <ActionBanner />
        <FaqSection />
        <Cta />
      </main>
      <Footer />
    </>
  );
}
