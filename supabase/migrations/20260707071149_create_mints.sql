create extension if not exists postgis with schema extensions;

-- Journal des mints (migration du journal local AsyncStorage `placekeepr:mint-log`).
-- Contrainte CLAUDE.md : toute interaction on-chain à revenu potentiel est logguée
-- ici pour la comptabilité future.
create table public.mints (
  id uuid primary key default gen_random_uuid(),
  signature text not null unique,
  minter text not null,
  location extensions.geography(point, 4326) not null,
  photo_path text,
  thumb_path text,
  cluster text not null default 'devnet',
  rpc_endpoint text,
  minted_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index mints_location_gix on public.mints using gist (location);
create index mints_minter_idx on public.mints (minter);

alter table public.mints enable row level security;

-- Phase d'apprentissage devnet, pas d'auth Supabase pour l'instant :
-- lecture et insertion ouvertes au rôle anon. À durcir quand l'auth arrive
-- (à terme les inserts viendront de l'indexer Helius, pas du client).
create policy "anon can read mints" on public.mints
  for select to anon using (true);
create policy "anon can insert mints" on public.mints
  for insert to anon with check (true);
