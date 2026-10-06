-- Horodatage de confirmation par l'indexer Helius (edge function
-- helius-webhook). Null = ligne uniquement déclarée par le client,
-- pas encore vue on-chain par l'indexer.
alter table public.mints add column indexed_at timestamptz;
