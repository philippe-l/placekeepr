-- Chemin du JSON de métadonnées cNFT dans le bucket place-photos
-- (null pour les mints d'avant la feature : URI placeholder on-chain).
alter table public.mints add column metadata_path text;
