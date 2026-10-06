-- Miroir Supabase du registre on-chain (programme place_registry), alimenté
-- par l'edge function helius-webhook — jamais par le client. La chaîne reste
-- la source de vérité ; ces tables servent aux compteurs, aux jointures et à
-- la comptabilité future (les likes datés nourriront le split royalties).

-- Un lieu inscrit au registre : une cellule de la grille (~11 m).
create table public.places (
  pda text primary key,
  keeper text not null,
  lat_e4 integer not null,
  lng_e4 integer not null,
  -- Tx d'inscription (= signature du mint qui l'accompagne dans la même tx).
  -- Null pour un backfill dont la tx n'a pas été retrouvée.
  register_signature text,
  registered_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (lat_e4, lng_e4)
);

create index places_keeper_idx on public.places (keeper);

-- État courant des likes : une ligne par PDA Like on-chain (couple lieu/likeur,
-- le PDA est stable). unliked_at null = like actif ; un re-like réactive la
-- même ligne. Pas de FK vers places : un indexer doit encaisser les événements
-- dans le désordre.
create table public.likes (
  pda text primary key,
  place_pda text not null,
  liker text not null,
  liked_at timestamptz not null,
  unliked_at timestamptz,
  like_signature text,
  unlike_signature text,
  created_at timestamptz not null default now(),
  unique (place_pda, liker)
);

create index likes_place_active_idx on public.likes (place_pda) where unliked_at is null;
create index likes_liker_idx on public.likes (liker);

alter table public.places enable row level security;
alter table public.likes enable row level security;

-- Lecture publique (lieux et likes sont publics par design) ; aucune écriture
-- anon — seul l'indexer écrit, en service role.
create policy "anon can read places" on public.places
  for select to anon using (true);
create policy "anon can read likes" on public.likes
  for select to anon using (true);
