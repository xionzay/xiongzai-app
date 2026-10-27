-- Private provenance for device/demo imports. No API exposes this table.
-- Legacy orders must not create ledger balances or imply hosted approval.
CREATE TABLE local_data_imports (
 id text PRIMARY KEY,
 source_hash text NOT NULL,
 snapshot jsonb NOT NULL,
 record_ids jsonb NOT NULL,
 imported_at timestamptz NOT NULL DEFAULT now()
);
