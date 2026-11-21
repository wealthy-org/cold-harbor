import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import proofs from "@/data/proofs-testnet.json";

export const metadata: Metadata = { title: "Cold Harbor | Docs" };

const X = proofs.explorer;
const tx = (h: string) => `${X}/tx/${h}`;
const addr = (a: string) => `${X}/address/${a}`;
const short = (h: string) => `${h.slice(0, 10)}…${h.slice(-6)}`;

const fw = proofs.forwardStack;
const CONTRACTS: { name: string; address: string; role: string; fns: string; events: string; errors: string }[] = [
  {
    name: "ColdHarborSettlement",
    address: proofs.settlement,
    role: "Spot RFQ settlement. Verifies the maker's EIP-712 quote and swaps both legs atomically in one transaction. Fee is paid by the taker and must equal the on-chain rate.",
    fns: "fillQuote(quote, makerSig), cancelNonce(bucket, nonce), registerSigner(signer, allowed), hashQuote, isNonceUsed. Owner: setTokenAllowed, setFeeRecipient, setFeeBps, pause, unpause.",
    events: "QuoteFilled, NonceCancelled, SignerRegistered, TokenAllowedSet, FeeRecipientSet, FeeBpsSet",
    errors: "QuoteExpired, NotTaker, NonceAlreadyUsed, InvalidSignature, TokenNotAllowed, NotUsdgPair, ZeroAmount, SameParty, FeeMismatch, FeeTooHigh",
  },
  {
    name: "ForwardEngine",
    address: fw.engine,
    role: "Cash-settled forwards on a tokenized stock, settled in USDG at an official market close. No share delivery.",
    fns: "openForward(quote, makerSig), topUp(id, amount), flagMarginCall(id), liquidate(id), settle(id), closeByMutual(id, price, makerSig, takerSig), getPosition, markToMarket, requiredMargin. Owner: setUnderlying, setParams, pause, unpause.",
    events: "ForwardOpened, MarginToppedUp, MarginCall, MarginCallCleared, ForwardLiquidated, ForwardSettled, ForwardClosed, ObservationDeferred, UnderlyingSet",
    errors: "UnderlyingNotActive, InvalidTerms, FeeMismatch, NotOfficialClose, TenorOutOfRange, NotionalOutOfRange, NotLiquidatable, NoMarginCall, TopUpWindowOpen, PriceNotLive, OraclePausedByToken",
  },
  {
    name: "MarginVault",
    address: fw.vault,
    role: "Holds USDG margin. Only the engine can lock, unlock, seize or charge. Owners withdraw only what is not locked. The engine address is set once.",
    fns: "deposit(amount), withdraw(amount), freeMargin(account). Engine only: lock, unlock, seize, charge. Owner: setEngine (once).",
    events: "Deposited, Withdrawn, Locked, Unlocked, Seized, EngineSet",
    errors: "NotEngine, EngineAlreadySet, InsufficientFree, InsufficientLocked, ZeroAmount",
  },
  {
    name: "OracleAdapter",
    address: fw.oracle,
    role: "Pins the price at an official close. Primary feed first, backup feed if the primary is stale. A pinned price cannot be changed.",
    fns: "observe(feed, closeTs), referencePrice(feed), pinned(feed, closeTs). Owner: setBackupFeed, setParams.",
    events: "ObservationPinned, BackupFeedSet, ParamsSet",
    errors: "TooEarly, BadParam",
  },
  {
    name: "MarketCalendar",
    address: fw.calendar,
    role: "US equity close times in UTC with daylight saving, plus owner-set holidays and early closes. Forwards can only mature on a business day.",
    fns: "isBusinessDay, closeOf, nextClose, lastCloseAtOrBefore, isOfficialClose, isDst. Owner: setHoliday, setEarlyClose.",
    events: "HolidaySet, EarlyCloseSet",
    errors: "NoCloseFound, InvalidEarlyClose",
  },
];

const DECISIONS: [string, string][] = [
  ["Feed comes from owner config", "The maker cannot choose the price source in a quote. The engine reads the feed registered for that token."],
  ["Loss capped at the losing side's margin", "No insurance fund. A party can lose at most what it posted. The counterparty bears the rest of the gap risk."],
  ["Margin call window is 4 ordinary hours", "After a flag, the party has 4 hours to top up before liquidation is allowed."],
  ["Liquidation penalty 2%", "90% goes to the counterparty, 10% to the protocol. Opening fee is 20 bps."],
  ["Pyth backup is not wrapped yet", "Testnet uses TestnetFeed. Mainnet plan is Chainlink primary, Pyth backup."],
  ["Dividends are not adjusted", "A forward on a dividend-paying stock does not pay or adjust for the dividend."],
  ["Not upgradeable", "Contracts have no proxy. A fix means a new deployment. OpenZeppelin v5.1.0, solc 0.8.28."],
  ["Taker pays the spot fee", "The relay forces the quote fee to equal the on-chain fee, or the quote is rejected."],
];

const LIMITS: [string, string][] = [
  ["Margin", "20% initial, 10% for ETFs (EWY, USO are placed in the ETF group, to be confirmed)."],
  ["Tenor", "7 to 92 days, on an official close."],
  ["Notional", "10,000 to 1,000,000 USDG per forward."],
  ["Keepers", "None required. Anyone can call flag, liquidate and settle."],
];

const RELAY: [string, string][] = [
  ["GET /health", "Relay, database, chain and indexer status. Includes how many makers are connected."],
  ["POST /rfq", "Body: product (spot or forward), ticker, side, amount, taker, and for forwards the maturity date. Returns every valid signed quote, best first, plus a count of rejected ones."],
  ["GET /fills/:wallet", "Spot fills for a wallet, read from the indexer."],
  ["GET /forwards/:wallet", "Forward positions and their outcomes for a wallet."],
  ["GET /rfqs/:wallet", "RFQ history for a wallet."],
  ["WS /mm/ws", "Maker socket. Header X-API-Key. Relay sends rfq.request, maker replies quote.submit, relay answers quote.ack."],
  ["POST /mm/nonce, /mm/login", "Wallet sign-in for the maker portal. One signed message, no transaction."],
  ["GET /mm/me, /mm/quotes", "Maker profile, connection status, limits and recent quotes."],
  ["POST /mm/key, PUT /mm/limits, DELETE /mm/limits/:ticker", "Create or replace the API key, set or remove per ticker limits."],
];

const kinds = proofs.forwardDeployTransactions.reduce<Record<string, number>>((m, t) => ((m[t.kind] = (m[t.kind] ?? 0) + 1), m), {});

function H({ id, n, children }: { id: string; n: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="scroll-mt-24 border-t border-ink-700 pt-12 text-[1.9rem] font-semibold tracking-[-0.02em]">
      <span className="mono-label mr-4 !text-signal-500">{n}</span>
      {children}
    </h2>
  );
}
const P = ({ children }: { children: React.ReactNode }) => <p className="mt-5 max-w-3xl text-[17px] leading-relaxed text-slate-300">{children}</p>;
const M = ({ children }: { children: React.ReactNode }) => <span className="font-mono text-[0.92em] text-mist-100">{children}</span>;
const Hash = ({ h }: { h: string }) => (
  <a href={tx(h)} target="_blank" rel="noreferrer" className="font-mono text-sm text-signal-500 hover:text-signal-300">{short(h)}</a>
);

const NAV: [string, string][] = [
  ["overview", "Overview"], ["flow", "How a trade works"], ["contracts", "Contracts"], ["decisions", "Design decisions"],
  ["params", "Parameters"], ["run", "Run it"], ["relay", "Relay API"], ["proofs", "Proof transactions"], ["status", "Status and risks"],
];

export default function DocsPage() {
  return (
    <div className="min-h-svh">
      <header className="border-b border-ink-700 bg-ink-950">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between px-8">
          <Link href="/" className="flex items-center gap-3">
            <Image src="/logo.png" alt="" width={30} height={30} />
            <span className="text-base font-semibold tracking-tight">Cold Harbor</span>
            <span className="mono-label ml-2 border border-ink-700 px-2 py-1">Docs</span>
          </Link>
          <Link href="/app" className="text-sm text-slate-300 hover:text-signal-500">Launch app</Link>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1200px] gap-16 px-8 py-14 lg:grid-cols-[200px_1fr]">
        <nav aria-label="Docs sections" className="hidden lg:block">
          <ul className="sticky top-24 space-y-3 text-sm">
            {NAV.map(([id, l]) => (
              <li key={id}><a href={`#${id}`} className="text-slate-300 hover:text-signal-500">{l}</a></li>
            ))}
          </ul>
        </nav>

        <main className="min-w-0 space-y-14 pb-24">
          <section id="overview" className="scroll-mt-24">
            <p className="mono-label mb-6">Documentation</p>
            <h1 className="max-w-[20ch] text-[2.8rem] font-semibold leading-[1.05] tracking-[-0.025em]">On-chain OTC for tokenized US stocks.</h1>
            <P>
              A trader asks for a quote. Several market makers answer with signed, firm prices. The trader picks one and it settles on Robinhood Chain in a single transaction. Large size gets a competing price instead of moving a pool.
            </P>
            <P>
              Two products. <M>Spot</M> swaps a tokenized stock for USDG atomically. <M>Forwards</M> fix a price for a future official market close and settle in cash (USDG) with margin on both sides.
            </P>
            <p className="mt-6 max-w-3xl border border-signal-500 p-4 text-[15px] leading-relaxed">
              <span className="mono-label !text-signal-500">Testnet only.</span> Everything below runs on Robinhood Chain testnet ({proofs.chainId}) with mock tokens and simulated market makers. Contracts are unaudited. Do not use them with real funds.
            </p>
          </section>

          <section>
            <H id="flow" n="01">How a trade works</H>
            <ol className="mt-6 max-w-3xl list-decimal space-y-3 pl-6 text-[17px] leading-relaxed text-slate-300">
              <li>The trader sends a request to the relay: ticker, side, size. For a forward, also a maturity date.</li>
              <li>The relay checks the request, fixes a reference price, and sends it to every connected maker over WebSocket.</li>
              <li>Each maker replies within the deadline with an EIP-712 signed quote. The relay verifies the signature, the fee, the price band against the reference, the size and the expiry, then simulates the fill on chain.</li>
              <li>The app shows the valid quotes, best first. Rejected quotes are counted, with a reason kept in the maker&apos;s history.</li>
              <li>The trader submits the chosen quote. Spot: <M>fillQuote</M> swaps both legs. Forward: <M>openForward</M> locks margin from both sides.</li>
              <li>A forward settles at the official close on its maturity date. Anyone can call <M>settle</M>. Before that, a side that falls below required margin can be flagged, then liquidated after the window.</li>
            </ol>
            <P>
              The relay never holds funds and cannot move them. It only routes quotes. If it goes down, a signed quote that is still valid can still be submitted to the contract directly.
            </P>
          </section>

          <section>
            <H id="contracts" n="02">Contracts</H>
            <P>Network: Robinhood Chain testnet, chain id {proofs.chainId}. Deployer and owner: <a className="font-mono text-sm text-signal-500" href={addr(proofs.deployer)} target="_blank" rel="noreferrer">{proofs.deployer}</a>. Source is verified on the explorer for every contract below, including the 36 TestnetFeed price mocks.</P>
            <div className="mt-8 space-y-10">
              {CONTRACTS.map((c) => (
                <article key={c.name} className="border border-ink-700 p-6">
                  <h3 className="text-xl font-semibold">{c.name}</h3>
                  <p className="mt-2 break-all"><a href={addr(c.address)} target="_blank" rel="noreferrer" className="font-mono text-sm text-signal-500 hover:text-signal-300">{c.address}</a></p>
                  <p className="mt-4 max-w-3xl text-slate-300">{c.role}</p>
                  <dl className="mt-5 grid gap-4 text-[15px] leading-relaxed">
                    {([["Functions", c.fns], ["Events", c.events], ["Errors", c.errors]] as const).map(([k, v]) => (
                      <div key={k}><dt className="mono-label mb-1">{k}</dt><dd className="font-mono text-[13px] text-slate-300">{v}</dd></div>
                    ))}
                  </dl>
                </article>
              ))}
            </div>
            <P>Other testnet addresses: USDG mock <a className="font-mono text-sm text-signal-500" href={addr(proofs.usdg)} target="_blank" rel="noreferrer">{proofs.usdg}</a>, 36 mock stock tokens and 36 test price feeds. The full list is in <M>contracts/deployments/rh-testnet.json</M> and <M>rh-testnet-forwards.json</M>.</P>
          </section>

          <section>
            <H id="decisions" n="03">Design decisions</H>
            <P>The forward decisions need sign-off before mainnet. Each one trades simplicity for a stated risk.</P>
            <table className="mt-6 w-full text-left text-[15px]">
              <tbody>
                {DECISIONS.map(([a, b]) => (
                  <tr key={a} className="border-b border-ink-800 align-top">
                    <th className="w-[30%] py-4 pr-6 font-medium">{a}</th>
                    <td className="py-4 text-slate-300">{b}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section>
            <H id="params" n="04">Parameters</H>
            <P>Defaults carry an assumption flag until confirmed against the brief.</P>
            <table className="mt-6 w-full text-left text-[15px]">
              <tbody>
                {LIMITS.map(([a, b]) => (
                  <tr key={a} className="border-b border-ink-800 align-top">
                    <th className="w-[30%] py-4 pr-6 font-medium">{a}</th>
                    <td className="py-4 text-slate-300">{b}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section>
            <H id="run" n="05">Run it</H>
            <P>Contracts, Foundry:</P>
            <pre className="mt-3 overflow-x-auto border border-ink-700 bg-ink-900 p-4 font-mono text-[13px] leading-relaxed">{`cd contracts
forge build
forge test          # 135 tests
forge coverage      # about 94% of lines`}</pre>
            <P>Relay, Node and Postgres. Set <M>DATABASE_URL</M> in <M>relay/.env</M> first:</P>
            <pre className="mt-3 overflow-x-auto border border-ink-700 bg-ink-900 p-4 font-mono text-[13px] leading-relaxed">{`cd relay
pnpm install
pnpm migrate
pnpm start          # http and websocket on :8080
pnpm sim:setup      # once: registers 4 simulated makers
pnpm sim:maker      # simulated makers answer RFQs`}</pre>
            <P>Web:</P>
            <pre className="mt-3 overflow-x-auto border border-ink-700 bg-ink-900 p-4 font-mono text-[13px] leading-relaxed">{`cd web
pnpm install
cp .env.example .env.local     # set NEXT_PUBLIC_RELAY_URL
pnpm dev -p 3005`}</pre>
            <P>Deploy: web on Vercel, relay and indexer on Railway (root <M>relay</M>, start <M>pnpm start</M>, health <M>/health</M>), Postgres on Neon. The web app never touches the database.</P>
          </section>

          <section>
            <H id="relay" n="06">Relay API</H>
            <table className="mt-6 w-full text-left text-[15px]">
              <tbody>
                {RELAY.map(([a, b]) => (
                  <tr key={a} className="border-b border-ink-800 align-top">
                    <th className="w-[38%] py-4 pr-6 font-mono text-[13px] font-medium">{a}</th>
                    <td className="py-4 text-slate-300">{b}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <P>Makers: sign in at <Link href="/mm" className="text-signal-500 hover:text-signal-300">/mm</Link>, create an API key, set limits. A quote above a limit is rejected before a taker sees it.</P>
          </section>

          <section>
            <H id="proofs" n="07">Proof transactions</H>
            <P>{proofs.note} Every hash links to the testnet explorer.</P>

            <h3 className="mt-10 text-xl font-semibold">Spot fills (3)</h3>
            <P>Real <M>fillQuote</M> calls: NVDA bought and sold against simulated makers.</P>
            <ul className="mt-4 space-y-2">
              {proofs.fillTransactions.map((f) => (
                <li key={f.hash} className="flex gap-6"><Hash h={f.hash} /><span className="font-mono text-sm text-slate-500">block {f.block}</span></li>
              ))}
            </ul>

            <h3 className="mt-10 text-xl font-semibold">Forward lifecycle: open and mutual close (2 transactions)</h3>
            <P>{proofs.forwardLifecycle.note}</P>
            <ul className="mt-4 space-y-2">
              <li className="flex flex-wrap gap-x-6"><Hash h={proofs.forwardLifecycle.openTx} /><span className="text-sm text-slate-300">openForward: forward #{proofs.forwardLifecycle.forwardId}, {proofs.forwardLifecycle.side} {proofs.forwardLifecycle.ticker}</span></li>
              <li className="flex flex-wrap gap-x-6"><Hash h={proofs.forwardLifecycle.closeByMutual.tx} /><span className="text-sm text-slate-300">closeByMutual at ${(Number(proofs.forwardLifecycle.closeByMutual.price8dp) / 1e8).toFixed(2)}, both sides signed off chain through the relay — {proofs.forwardLifecycle.closeByMutual.statusAfter}</span></li>
            </ul>

            <h3 className="mt-10 text-xl font-semibold">Spot stack deployment ({proofs.deployTransactions.length} transactions)</h3>
            <ul className="mt-4 space-y-2">
              {proofs.deployTransactions.filter((t) => t.kind === "ColdHarborSettlement" && !t.fn).map((t) => (
                <li key={t.hash} className="flex gap-6"><Hash h={t.hash} /><span className="text-sm text-slate-300">ColdHarborSettlement deployed</span></li>
              ))}
            </ul>
            <details className="mt-4">
              <summary className="cursor-pointer text-sm text-signal-500">All {proofs.deployTransactions.length} deployment transactions</summary>
              <ul className="mt-4 space-y-2">
                {proofs.deployTransactions.map((t) => (
                  <li key={t.hash} className="flex flex-wrap gap-x-6"><Hash h={t.hash} /><span className="text-sm text-slate-300">{t.kind}{t.fn ? ` ${t.fn}` : ""}</span></li>
                ))}
              </ul>
            </details>

            <h3 className="mt-10 text-xl font-semibold">Forward stack ({proofs.forwardDeployTransactions.length} transactions)</h3>
            <P>
              {Object.entries(kinds).map(([k, v]) => `${k} ${v}`).join(", ")}. Deploy and wiring succeeded on all {proofs.forwardDeployTransactions.length}. The price feeds were seeded with reference prices, and four simulated makers received 1,000,000 USDG of margin each.
            </P>
            <details className="mt-4">
              <summary className="cursor-pointer text-sm text-signal-500">All forward deployment transactions</summary>
              <ul className="mt-4 space-y-2">
                {proofs.forwardDeployTransactions.map((t) => (
                  <li key={t.hash} className="flex flex-wrap gap-x-6"><Hash h={t.hash} /><span className="text-sm text-slate-300">{t.kind}</span></li>
                ))}
              </ul>
            </details>
            <details className="mt-4">
              <summary className="cursor-pointer text-sm text-signal-500">{proofs.feedSeedTransactions.length} feed seed transactions</summary>
              <ul className="mt-4 space-y-2">
                {proofs.feedSeedTransactions.map((t) => (
                  <li key={t.hash} className="flex flex-wrap gap-x-6"><Hash h={t.hash} /><span className="text-sm text-slate-300">{t.symbol} at {t.price.toFixed(2)}</span></li>
                ))}
              </ul>
            </details>
            <details className="mt-4">
              <summary className="cursor-pointer text-sm text-signal-500">Simulated maker margin setup</summary>
              <ul className="mt-4 space-y-2">
                {proofs.simMakerVaultSetup.flatMap((m) => m.hashes.map((h) => (
                  <li key={h} className="flex flex-wrap gap-x-6"><Hash h={h} /><span className="font-mono text-sm text-slate-500">{short(m.maker)}</span></li>
                )))}
              </ul>
            </details>
            <p className="mt-8 max-w-3xl border border-ink-700 p-4 text-[15px] leading-relaxed text-slate-300">
              Not yet proven on chain: topping up margin, flagging a margin call, liquidating, and a settle at an official close. Opening a forward and an early mutual close are proven above. All of it needs a wallet holding testnet tokens; this section is updated as each run is done.
            </p>
          </section>

          <section>
            <H id="status" n="08">Status and risks</H>
            <ul className="mt-6 max-w-3xl list-disc space-y-3 pl-6 text-[17px] leading-relaxed text-slate-300">
              <li>No external audit. Internal tests: 135 passing, about 94% line coverage. Slither static analysis run: no High or Medium findings; the Low/informational results (timestamp comparisons, naming convention, missing interface inheritance) are reviewed in <code className="text-signal-400">contracts/slither-report.txt</code>.</li>
              <li>Source is verified on the explorer for all 5 live contracts plus the 36 TestnetFeed mocks.</li>
              <li>Tested with a read-only wallet shim and local keys. Not yet tested with MetaMask or Rabby, or with transaction buttons end to end.</li>
              <li>Testnet uses mock tokens, a test price feed and simulated makers. The real Robinhood stock tokens and their decimals are not confirmed.</li>
              <li>The indexer has no reorg handling. Add a confirmation depth before mainnet.</li>
              <li>Maker sessions live in relay memory. A relay restart means signing in again. One relay instance only.</li>
              <li>Mainnet needs Chainlink and Pyth wiring, a final fee and margin review, and an audit.</li>
            </ul>
          </section>
        </main>
      </div>
    </div>
  );
}
