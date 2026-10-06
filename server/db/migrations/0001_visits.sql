-- Visites vérifiées (Phase 4) : miroir du programme place_registry.
--
-- La chaîne garde l'agrégat (PDA Visit : compteur + last_visited_at, cooldown
-- 24 h). Le détail de chaque passage n'existe nulle part on-chain : c'est ici
-- qu'il vit, alimenté par l'indexer Helius.
--
-- Rejouable (règle de src/migrate.ts) : `if not exists` partout, et la
-- fonction géospatiale est reconstruite après un `drop if exists` — sa
-- signature de retour change (nouvelle colonne visit_count), ce que
-- `create or replace` refuse.

-- ── Historique des passages ────────────────────────────────────────────────
-- Un événement par instruction visit_place. La clé porte la signature ET le
-- PDA : Helius rejoue un lot sur réponse non-2xx, et l'insertion doit être
-- idempotente sans pour autant fusionner deux visites distinctes qui
-- partageraient une transaction.
create table if not exists public.visit_events (
  signature text not null,
  visit_pda text not null,
  place_pda text not null,
  visitor text not null,
  visited_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (signature, visit_pda)
);

create index if not exists visit_events_place_idx on public.visit_events (place_pda, visited_at desc);
create index if not exists visit_events_visitor_idx on public.visit_events (visitor, visited_at desc);

-- ── Agrégat courant par PDA Visit ──────────────────────────────────────────
-- Miroir du compte on-chain (couple lieu/visiteur). `visit_count` est
-- **recalculé** depuis visit_events par l'indexer, jamais incrémenté : un
-- rejeu Helius ne doit pas gonfler le compteur.
create table if not exists public.visits (
  pda text primary key,
  place_pda text not null,
  visitor text not null,
  visit_count integer not null,
  first_visited_at timestamptz not null,
  last_visited_at timestamptz not null,
  last_signature text,
  created_at timestamptz not null default now(),
  unique (place_pda, visitor)
);

create index if not exists visits_place_idx on public.visits (place_pda);
create index if not exists visits_visitor_idx on public.visits (visitor);

-- ── Contrôle de présence ───────────────────────────────────────────────────
-- Généralise travel_check : le dernier événement physique du wallet, capture
-- OU visite. Sans ça, alterner mint et visite permettait de se téléporter
-- entre deux contrôles de vitesse — chaque table ne voyait que la moitié de
-- l'historique. Les visites sont localisées à la précision de la cellule
-- (~11 m), ce qui est exactement la promesse d'une visite vérifiée (≤ 50 m).
create or replace function public.presence_check(p_wallet text, lat double precision, lng double precision)
returns table (distance_m double precision, seconds_elapsed double precision)
language sql
stable
set search_path = public, extensions
as $$
  with events as (
    select m.location as location, m.minted_at as occurred_at
      from public.mints m
     where m.minter = p_wallet
    union all
    select st_setsrid(st_makepoint(p.lng_e4 / 10000.0, p.lat_e4 / 10000.0), 4326)::geography, v.visited_at
      from public.visit_events v
      join public.places p on p.pda = v.place_pda
     where v.visitor = p_wallet
  )
  select
    st_distance(e.location, st_setsrid(st_makepoint(lng, lat), 4326)::geography) as distance_m,
    extract(epoch from (now() - e.occurred_at)) as seconds_elapsed
  from events e
  order by e.occurred_at desc
  limit 1
$$;

-- ── nearby_places v3 : + compteur de passages ──────────────────────────────
-- Identique à v2, une colonne de plus. Le total des passages de la cellule se
-- lit dans l'agrégat (une ligne par visiteur) plutôt que dans l'historique.
drop function if exists public.nearby_places(double precision, double precision, double precision);

create function public.nearby_places(lat double precision, lng double precision, radius_m double precision)
returns table (
  signature text,
  minter text,
  latitude double precision,
  longitude double precision,
  photo_path text,
  thumb_path text,
  minted_at timestamptz,
  distance_m double precision,
  like_count integer,
  visit_count integer
)
language sql
stable
set search_path = public, extensions
as $$
  with cells as (
    select
      m.signature,
      m.minter,
      m.location,
      m.photo_path,
      m.thumb_path,
      m.minted_at,
      round(st_y(m.location::geometry)::numeric * 10000)::integer as lat_e4,
      round(st_x(m.location::geometry)::numeric * 10000)::integer as lng_e4,
      st_distance(m.location, st_setsrid(st_makepoint(lng, lat), 4326)::geography) as distance_m
    from public.mints m
    where st_dwithin(m.location, st_setsrid(st_makepoint(lng, lat), 4326)::geography, radius_m)
  ),
  deduped as (
    select distinct on (c.lat_e4, c.lng_e4)
      c.*,
      p.pda as place_pda
    from cells c
    left join public.places p on p.lat_e4 = c.lat_e4 and p.lng_e4 = c.lng_e4
    order by c.lat_e4, c.lng_e4, (c.signature = p.register_signature) desc nulls last, c.minted_at asc
  )
  select
    d.signature,
    d.minter,
    st_y(d.location::geometry) as latitude,
    st_x(d.location::geometry) as longitude,
    d.photo_path,
    d.thumb_path,
    d.minted_at,
    d.distance_m,
    coalesce(
      (select count(*) from public.likes k where k.place_pda = d.place_pda and k.unliked_at is null),
      0
    )::integer as like_count,
    coalesce(
      (select sum(v.visit_count) from public.visits v where v.place_pda = d.place_pda),
      0
    )::integer as visit_count
  from deduped d
  order by d.distance_m
$$;
