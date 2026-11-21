-- Testnet simulated makers connect like real ones. The flag lets the UI label their quotes honestly.
ALTER TABLE mm_profiles ADD COLUMN simulated BOOLEAN NOT NULL DEFAULT false;
