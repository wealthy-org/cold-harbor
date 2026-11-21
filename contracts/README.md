# Cold Harbor contracts

Spot RFQ settlement for tokenized stocks on Robinhood Chain (mainnet 4663, testnet 46630).
Brief: `../dev-brief-otc-tokenized-stock-rhc.md` section 7.1.

## Status
`ColdHarborSettlement` is implemented, tested, and deployed + source-verified (Sourcify, `exact_match`) on Robinhood Chain testnet 46630 with mock tokens: see `deployments/rh-testnet.json`. NOT audited. NOT on mainnet.
Forward stack implemented and tested locally (not deployed anywhere yet): `MarketCalendar`, `OracleAdapter`, `MarginVault`, `ForwardEngine`.
Not yet built: Permit2 path, keeper, price-feed mocks for testnet (RHC testnet has no Chainlink feeds), deploy scripts for the forward stack.

## Setup
```
./install-deps.sh
forge test
```

## Commands
```
forge build --sizes
forge test
forge coverage --report summary --no-match-coverage "(test|script)"
```
Deploy (testnet only, user runs it with a keystore): see `script/Deploy.s.sol` header for env vars.

## Design decisions (confirm with Bos Fine)
1. **Fee model.** Taker pays the protocol fee, maker is fee-neutral so MMs quote their exact price.
   Buy: taker pays `takerAmount` to maker plus `fee` on top. Sell: maker sends `makerAmount`, of which `fee` goes to the fee recipient.
   `fee = usdgAmount * feeBps / 10_000`. The brief says "dipotong dari sisi USDG"; this is one reading of it.
2. **Fee is enforced, not just signed.** `q.feeBps` must equal the protocol `feeBps` at fill time. Otherwise maker and taker could sign `feeBps = 0`
   to skip the fee. Side effect: a fee change invalidates outstanding quotes (they live 15-30 s anyway). Hard cap `MAX_FEE_BPS = 100`.
3. **Nonces.** Brief gives `nonceBucket (uint64)` and `nonce (uint128)`. Bitmap per `(maker, bucket)`, word index `nonce >> 8`, bit `nonce & 0xff`,
   so any uint128 nonce works. Nonce is burned only if the whole fill succeeds.
4. **Signers.** Valid signature = maker EOA, a signer registered by the maker, or an ERC-1271 maker contract.
5. **Not upgradeable.** Brief lists UUPS as an assumption. Left out to keep the audited surface small; can be added before mainnet.
6. **USDG pair.** Exactly one side must be USDG, the other an allowlisted stock token. Stock-for-stock is rejected.
7. **Admin.** `Ownable2Step`, `Pausable`. On mainnet the deploy script requires the owner to be a contract (Safe).
8. **Dependencies.** OpenZeppelin v5.1.0 with solc 0.8.28 (OZ 5.7 needs solc >= 0.8.31). `evm_version = cancun`: confirm RHC supports it before deploying.

## Known limits
- Fee-on-transfer or rebasing tokens are not supported. The stock-token allowlist is the control; check each token before `setTokenAllowed`.
- Stock tokens carry an `oraclePaused()` / multiplier mechanism (ERC-8056). Settlement here does not read it; a spot fill moves token units at the signed price.
- Forge lint warnings on `block.timestamp`, event-after-call and `transferFrom` from `q.taker`/`q.maker` were reviewed:
  expiry is meant to be time based, `fillQuote` is `nonReentrant`, `taker == msg.sender` is enforced, `maker` signed the quote.

## Verified so far
- 35 tests (incl. 4 fuzz suites, 512 runs): buy/sell, fee math, replay, cancel, hot signer, ERC-1271, expiry boundary, wrong taker/signer, tampering, allowlist, pause, atomic revert, two-step ownership.
- Line coverage 93%. Runtime size 7,168 B (limit 24,576 B).
- Deploy script rehearsed on a local anvil (chain 31337) and the mainnet guards on anvil with chain id 4663.
- Testnet: deployed with `script/DeployTestnet.s.sol` (mock USDG + 36 mock stock tokens, all allowlisted). Real buy and sell fills through the web app, balances checked on chain, settlement contract holds 0 after fills.
- Failure paths on the real testnet: tampered amount and garbage signature (`InvalidSignature`), wrong caller (`NotTaker`), fee 0 (`FeeMismatch`), replay (`NonceAlreadyUsed`), expired (`QuoteExpired`).
- NOT done: fork test against mainnet tokens, Slither, external audit, Permit2.

## Testnet mocks
`src/mocks/FaucetToken.sol` has a public `mint`. It exists only for testnet; `DeployTestnet.s.sol` refuses chain 4663. Stock token addresses on mainnet must come from the official Robinhood registry.


## Forward stack (brief 7.3 to 7.5)
| Contract | Role |
|---|---|
| `MarketCalendar` | Official US closes. DST computed on chain, holidays and early closes set by owner |
| `OracleAdapter` | `observe(feed, closeTs)` walks back Chainlink rounds to the last print at or before the close, pins it, defers if none or if primary and backup disagree. `referencePrice` for marks, with sequencer check |
| `MarginVault` | USDG margin. Free margin withdrawable, locked margin moved only by the engine (set once) |
| `ForwardEngine` | Open from a maker-signed EIP-712 quote, top-up, margin call, keeper liquidation, settle at maturity, mutual early close |

Design decisions to confirm with the lead:
1. **Feed is not in the quote.** The brief's `ForwardQuote` carries `feed`; here the engine derives it from the owner-configured underlying, so a maker cannot point a quote at a feed they control.
2. **Loss is capped at posted margin.** If the price gaps past the loser's margin the winner is not made whole. There is no insurance fund.
3. **Margin call window is 4 wall-clock hours**, not "4 market hours" as in the brief. Liquidation needs a live price (fresh print, healthy sequencer).
4. **Liquidation penalty** 2% of notional from the liquidated side, 90% to the counterparty and 10% to the protocol. Open fee 20 bps from the taker. Both are owner-settable within caps (fee at most 100 bps, penalty at most 1000 bps).
5. **Maintenance** is a fraction of notional at the strike (`mmBps`), as in the brief's example (IM 20%, MM 10%).
6. **Corporate actions:** settlement and liquidation are deferred while the stock token reports `oraclePaused()`. Cash dividends are not adjusted (brief marks this unverified).
7. **Taker side only.** `Side` is the taker's side. The maker holds the opposite.
8. **Pyth Pro backup** is any AggregatorV3-shaped feed set with `setBackupFeed`. The Pyth wrapper itself is not written.

Bug found by tests: `(isDst ? 20 : 21) * 3600` is typed `uint16` and overflowed at 75600; widened to `uint256` before multiplying.

Tests: 130 in total (forward stack: 15 calendar, 20 oracle, 11 vault, 49 engine, with fuzz). Line coverage 94%.
