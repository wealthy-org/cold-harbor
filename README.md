# Cold Harbor

On-chain OTC desk for tokenized US stocks on Robinhood Chain. Request firm quotes from competing market makers, settle atomically in one transaction. Cash-settled forwards are planned.

Spec: `dev-brief-otc-tokenized-stock-rhc.md`.

| Folder | What |
|---|---|
| `contracts/` | Foundry. `ColdHarborSettlement` (spot RFQ), tests, deploy scripts |
| `web/` | Next.js 16 landing and trade app (`/app/trade`, `/app/forwards` preview, `/app/portfolio`) |

## Status
- Spot RFQ contract: implemented, 35 tests, deployed and source-verified on Robinhood Chain **testnet** (46630) with mock tokens. Not audited. Not on mainnet.
- Trade app: works end to end on testnet and local anvil. Quotes come from **simulated makers** (labelled in the UI). Reference prices are real (Robinhood Stock Token API).
- Forwards: contracts implemented and tested (`MarketCalendar`, `OracleAdapter`, `MarginVault`, `ForwardEngine`, 95 tests). Not deployed. Deployed on testnet (see contracts/deployments/rh-testnet-forwards.json) with mock price feeds (TestnetFeed, anyone can push). UI wired: vault deposit and withdraw, calendar check against the contract, simulated maker quotes, open, top-up, margin call, liquidate, settle, and mock price buttons. NOT yet exercised with real transactions. Missing: real relay, indexer, mutual close UI, Pyth/Chainlink on mainnet.
- Not built yet: RFQ relay, indexer, maker portal (`/mm` is a placeholder).

## Run locally
```
cd contracts && ./install-deps.sh && forge test
cd ../web && pnpm install && cp .env.example .env.local
pnpm dev -p 3005
```
Port 3000 may be taken on some machines. For a full local chain, start `anvil`, run `python3 contracts/script/local_setup.py` (writes `web/.env.local`), then `pnpm dev`.

## Testnet deployment (46630)
Addresses are in `contracts/deployments/rh-testnet.json`. Tokens there are `FaucetToken` mocks (public `mint`), not Robinhood's tokens. The deploy is run by the owner with a Foundry keystore (`contracts/script/DeployTestnet.s.sol`).

## Security
- Never commit `.env*`, `contracts/.secrets/`, keystores or private keys. `.gitignore` covers them.
- `contracts/.secrets/` holds throwaway TESTNET keys used by simulated makers and test taker. Do not fund them with real value.
- Simulated quotes are disabled on chain 4663.
