-- One pending or ready mutual-close negotiation per forward. A new price from either side
-- resets it; a matching price from the other side fills in the second signature.
CREATE TABLE close_proposals (
  forward_id  NUMERIC(78,0) PRIMARY KEY,
  price       NUMERIC(78,0) NOT NULL,
  maker_sig   TEXT,
  taker_sig   TEXT,
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ready')),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
