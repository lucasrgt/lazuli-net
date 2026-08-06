CREATE TABLE IF NOT EXISTS wallets (
  id uuid PRIMARY KEY,
  org_id uuid NOT NULL,
  display_name varchar(120) NOT NULL,
  created_at timestamptz NOT NULL,
  archived boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS wallets_visible_order_idx
  ON wallets (org_id, created_at ASC, id ASC)
  WHERE archived = false;
