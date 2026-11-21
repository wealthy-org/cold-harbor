-- Cold Harbor relay schema (dev brief section 9, trimmed to what the relay and portal need first).
-- Amounts are stored as NUMERIC(78,0) strings of base units so nothing loses precision.

CREATE TABLE accounts (
  id          BIGSERIAL PRIMARY KEY,
  wallet      TEXT NOT NULL UNIQUE CHECK (wallet = lower(wallet)),
  role        TEXT NOT NULL CHECK (role IN ('trader','mm','admin')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE mm_profiles (
  account_id        BIGINT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  api_key_hash      TEXT UNIQUE,              -- sha256 of the key. The key itself is shown once and never stored.
  api_key_prefix    TEXT,                     -- first 8 chars, so the portal can show which key is active
  signer_addresses  TEXT[] NOT NULL DEFAULT '{}',
  status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','suspended')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE mm_limits (
  mm_id              BIGINT NOT NULL REFERENCES mm_profiles(account_id) ON DELETE CASCADE,
  ticker             TEXT NOT NULL,           -- '*' = default for every ticker
  max_notional       NUMERIC(78,0) NOT NULL,  -- USDG, 6 dp
  max_per_taker      NUMERIC(78,0) NOT NULL,
  max_open_forwards  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (mm_id, ticker)
);

CREATE TABLE rfqs (
  rfq_id      TEXT PRIMARY KEY,
  taker       TEXT NOT NULL,
  product     TEXT NOT NULL CHECK (product IN ('spot','forward')),
  ticker      TEXT NOT NULL,
  side        TEXT NOT NULL,                  -- BUY/SELL for spot, LONG/SHORT for forward (taker's side)
  amount      NUMERIC(78,0) NOT NULL,         -- token base units (18 dp)
  params      JSONB NOT NULL DEFAULT '{}',    -- forward: maturityCloseTs
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed','filled','expired','cancelled')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL
);
CREATE INDEX rfqs_taker_idx ON rfqs (taker, created_at DESC);

CREATE TABLE quotes (
  id           BIGSERIAL PRIMARY KEY,
  rfq_id       TEXT NOT NULL REFERENCES rfqs(rfq_id) ON DELETE CASCADE,
  mm_id        BIGINT NOT NULL REFERENCES mm_profiles(account_id),
  payload      JSONB NOT NULL,
  signature    TEXT NOT NULL,
  net_price    NUMERIC(40,12),                -- USDG per token, net of fee, from the taker's point of view
  received_ms  INTEGER NOT NULL,              -- latency since the RFQ was broadcast
  outcome      TEXT NOT NULL DEFAULT 'pending' CHECK (outcome IN ('pending','rejected','won','lost','expired','filled')),
  reject_reason TEXT,
  UNIQUE (rfq_id, mm_id)                      -- one active quote per maker per RFQ (brief 8)
);
CREATE INDEX quotes_mm_idx ON quotes (mm_id, rfq_id);

CREATE TABLE fills (
  tx_hash       TEXT NOT NULL,
  log_index     INTEGER NOT NULL,
  product       TEXT NOT NULL CHECK (product IN ('spot','forward')),
  rfq_id        TEXT,
  maker         TEXT NOT NULL,
  taker         TEXT NOT NULL,
  ticker        TEXT,
  maker_token   TEXT,
  taker_token   TEXT,
  maker_amount  NUMERIC(78,0),
  taker_amount  NUMERIC(78,0),
  fee           NUMERIC(78,0),
  forward_id    NUMERIC(78,0),
  block_number  BIGINT NOT NULL,
  block_time    TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (tx_hash, log_index)            -- the indexer can safely re-read a block range
);
CREATE INDEX fills_maker_idx ON fills (maker, block_time DESC);
CREATE INDEX fills_taker_idx ON fills (taker, block_time DESC);

CREATE TABLE forwards (
  id                NUMERIC(78,0) PRIMARY KEY,
  rfq_id            TEXT,
  maker             TEXT NOT NULL,
  taker             TEXT NOT NULL,
  ticker            TEXT,
  stock_token       TEXT NOT NULL,
  taker_side        TEXT NOT NULL CHECK (taker_side IN ('LONG','SHORT')),
  qty               NUMERIC(78,0) NOT NULL,
  strike            NUMERIC(78,0) NOT NULL,   -- 8 dp
  maturity_close_ts BIGINT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','settled','liquidated','closed')),
  open_tx           TEXT NOT NULL,
  closed_tx         TEXT,
  close_price       NUMERIC(78,0)
);
CREATE INDEX forwards_maker_idx ON forwards (maker, status);
CREATE INDEX forwards_taker_idx ON forwards (taker, status);

-- Where the indexer stopped, per contract, so a restart on Railway resumes instead of re-reading everything.
CREATE TABLE indexer_state (
  contract        TEXT PRIMARY KEY,
  last_block      BIGINT NOT NULL
);
