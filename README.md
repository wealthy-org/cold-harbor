# Cold Harbor

On-chain OTC desk for tokenized US stocks on Robinhood Chain. Multi-maker RFQ for atomic spot block
trades, and cash-settled forwards collateralized in USDG. Non-custodial: settlement is one transaction
on a smart contract, not a bilateral OTC deal.

Spec: `dev-brief-otc-tokenized-stock-rhc.md`.

| Folder | What |
|---|---|
| `contracts/` | Foundry. `ColdHarborSettlement` (spot), `ForwardEngine` + `MarginVault` + `OracleAdapter` + `MarketCalendar` (forwards), mocks, 143 tests |
| `relay/` | Node/TypeScript RFQ relay, maker WebSocket hub, chain indexer, maker portal API, Postgres (Neon) |
| `web/` | Next.js 16 landing, trade app (`/app/trade`, `/app/forwards`, `/app/portfolio`), maker portal (`/mm`), docs (`/docs`) |

## Status (testnet, Robinhood Chain 46630)
- **Spot RFQ**: `ColdHarborSettlement` deployed and source-verified on the testnet explorer. 3 real
  fills executed end to end (quote → sign → `fillQuote`). No sim fallback — the relay is mandatory.
- **Forwards**: `MarginVault`, `OracleAdapter`, `MarketCalendar`, `ForwardEngine` deployed and
  source-verified. One forward opened and mutually closed on-chain (id 1). `rollMaturity`
  (following-business-day shift) and `OracleAdapter` governance force-observe with a timelock are
  implemented and tested (143/143) but **not yet redeployed** to the live testnet addresses.
- **Relay**: WebSocket RFQ hub, EIP-712 quote validation, rate limiting, mutual-close negotiation,
  maker portal auth (wallet sign-in, API keys, per-ticker limits), chain indexer (spot fills, forward
  lifecycle, margin events, oracle observations, calendar changes) into Postgres. 12/12 tables from
  the dev brief's data model exist. Test coverage is manual scripts (`scripts/portal-test.ts`,
  `scripts/relay-negative-test.ts`), not wired into `vitest`.
- **Web**: landing, `/app` (trade + forwards + portfolio), `/mm` (maker portal), `/docs` (architecture,
  contract reference, 200+ proof tx hashes) are all live and relay-backed. Deployed: Vercel (web),
  Railway (relay + indexer), Neon (Postgres).
- **Security**: Slither static analysis run on every contract — no High/Medium findings
  (`contracts/slither-report.txt`). No external audit yet.
- **Known gaps**: no automated keeper (settle/liquidate are manual calls), no `fillQuoteWithPermit2`,
  no CSV export on the trader dashboard, no deposit-margin button for makers in `/mm` (the vault call
  works, just not wired to a UI button), no standalone `/mm/positions` or `/mm/stats` REST endpoints,
  no separate forward-settlement fee (only the open fee).

## Run locally
```
cd contracts && ./install-deps.sh && forge test
cd ../relay && pnpm install && cp .env.example .env && pnpm migrate
cd ../web && pnpm install && cp .env.example .env.local
pnpm dev -p 3005
```
`relay/.env` needs a Postgres `DATABASE_URL` (Neon recommended; never commit it) and the contract
addresses from `contracts/deployments/*.json`. For a full local chain instead of testnet, start
`anvil` and run `python3 contracts/script/local_setup.py` (writes `web/.env.local`).

## Testnet deployment (46630)
Addresses are in `contracts/deployments/rh-testnet.json` and `rh-testnet-forwards.json`. Tokens are
`FaucetToken` mocks (public `mint`) and price feeds are `TestnetFeed` mocks (public push), not real
Robinhood/Chainlink infrastructure. Deploys are run by the owner with a Foundry keystore
(`contracts/script/DeployTestnet.s.sol`, `DeployForwardsTestnet.s.sol`). Proof transactions for every
deploy and fill are recorded in `contracts/deployments/proofs-testnet.json`.

## Security
- Never commit `.env*`, `contracts/.secrets/`, keystores or private keys. `.gitignore` covers them.
- `contracts/.secrets/` holds throwaway TESTNET keys used by simulated makers and the test taker.
  Do not fund them with real value.
- Simulated quotes and keys are disabled on chain 4663 (mainnet); the relay refuses to boot against it.
- Slither report: `contracts/slither-report.txt`.
