-- The 5 tables from the dev brief (section 9) that weren't built yet: universe, margin_events,
-- observations, calendar, fee_ledger. All are analytics/off-chain-cache tables; on-chain state
-- stays authoritative, these just make it queryable without re-reading chain history.

CREATE TABLE universe (
  ticker          TEXT PRIMARY KEY,
  token_address   TEXT NOT NULL,
  chainlink_feed  TEXT,             -- testnet: TestnetFeed mock address; mainnet: real Chainlink aggregator
  pyth_feed_id    TEXT,             -- not wired yet (brief 6.2: Pyth Pro backup)
  is_etf          BOOLEAN NOT NULL DEFAULT false,
  im_bps          INTEGER,          -- initial margin bps used for forwards on this ticker
  active          BOOLEAN NOT NULL DEFAULT true,
  paused          BOOLEAN NOT NULL DEFAULT false
);

-- History of MarginToppedUp / MarginCall / MarginCallCleared / ForwardLiquidated for a forward.
-- `forwards.status` only holds the latest state; this is the audit trail the brief's dashboard needs.
CREATE TABLE margin_events (
  id          BIGSERIAL PRIMARY KEY,
  forward_id  NUMERIC(78,0) NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('topup','call','call_cleared','liquidation')),
  who         TEXT,
  amount      NUMERIC(78,0),        -- topup amount, or liquidation penalty
  price       NUMERIC(78,0),        -- liquidation price, if applicable
  tx_hash     TEXT NOT NULL,
  block_time  TIMESTAMPTZ NOT NULL
);
CREATE INDEX margin_events_forward_idx ON margin_events (forward_id, block_time DESC);

-- Mirrors OracleAdapter's ObservationPinned event: the price actually used to settle each
-- (feed, closeTs) pair, and whether it came from Chainlink, the Pyth backup, or a forced governance observe.
CREATE TABLE observations (
  id           BIGSERIAL PRIMARY KEY,
  feed         TEXT NOT NULL,
  close_ts     BIGINT NOT NULL,
  price        NUMERIC(78,0) NOT NULL,
  source       TEXT NOT NULL CHECK (source IN ('chainlink','pyth','forced')),
  resolved_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (feed, close_ts)
);

-- Off-chain cache of MarketCalendar, so the UI and reports can query holidays without an RPC call per day.
-- Source of truth stays on-chain; resync this table whenever setHoliday/setEarlyClose is called.
CREATE TABLE calendar (
  day_index       INTEGER PRIMARY KEY,  -- days since epoch, matches MarketCalendar's dayIndex
  is_holiday      BOOLEAN NOT NULL DEFAULT false,
  early_close_ts  BIGINT
);

-- Running total of protocol revenue, split by product, for the 6-month revenue target (brief section 13).
CREATE TABLE fee_ledger (
  id           BIGSERIAL PRIMARY KEY,
  source       TEXT NOT NULL CHECK (source IN ('spot','forward')),
  ref_id       TEXT NOT NULL,        -- rfq_id for spot, forward id for forward open fee or liquidation protocol cut
  kind         TEXT NOT NULL DEFAULT 'fee' CHECK (kind IN ('fee','liquidation_cut')),
  amount_usdg  NUMERIC(78,0) NOT NULL,
  block_time   TIMESTAMPTZ NOT NULL
);
CREATE INDEX fee_ledger_time_idx ON fee_ledger (block_time DESC);
