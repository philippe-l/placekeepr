-- Limites de capture (#45 quota par jour, #46 distance minimale).
--
-- Rejouable (règle de src/migrate.ts) : `if not exists` / `create or replace`.
--
-- `capture_grants` journalise chaque co-signature de capture ACCORDÉE, écrite
-- juste avant de rendre la signature. On ne compte pas sur `mints` : la ligne
-- n'y arrive qu'après le mint (sync ou indexer, quelques secondes plus tard),
-- deux captures lancées en parallèle passeraient toutes les deux. Une
-- co-signature dont la tx échoue ensuite compte quand même : plus strict,
-- assumé. Une ligne par (wallet, cellule) : réessayer la même capture
-- rafraîchit la ligne au lieu de consommer du quota.
create table if not exists public.capture_grants (
  wallet text not null,
  lat_e4 integer not null,
  lng_e4 integer not null,
  granted_at timestamptz not null default now(),
  primary key (wallet, lat_e4, lng_e4)
);

create index if not exists capture_grants_granted_at_idx on public.capture_grants (granted_at);

-- Verdict des deux limites pour une capture en (lat, lng), cellule (p_lat_e4,
-- p_lng_e4) :
--  - captures_today : cellules co-signées au wallet sur 24 h glissantes, hors
--    la cellule visée (une reprise ne se compte pas deux fois) ;
--  - nearest_m : distance au lieu le plus proche dans p_radius_m (null si
--    aucun). Lieux = miroir `places` (tous gardiens, soi compris : pas de
--    grignotage autour de son propre lieu) + co-signatures récentes des AUTRES
--    wallets, qui couvrent le décalage d'indexation. Les siennes sont exclues,
--    sans quoi la reprise d'une capture échouée buterait sur elle-même.
-- Best-effort par construction : ça dépend du miroir. Le cas grave (même
-- cellule) reste bloqué on-chain par l'init du PDA Place. Les lieux legacy
-- (pré-registre, dans `mints` seulement) ne comptent pas.
create or replace function public.capture_limits(
  p_wallet text,
  lat double precision,
  lng double precision,
  p_lat_e4 integer,
  p_lng_e4 integer,
  p_radius_m double precision
)
returns table (captures_today integer, nearest_m double precision)
language sql
stable
set search_path = public, extensions
as $$
  with box as (
    -- Boîte englobante en unités 1e-4° (~11,1 m en latitude) avant le calcul
    -- exact : l'index unique (lat_e4, lng_e4) de `places` filtre, st_distance
    -- ne voit que les voisins.
    select ceil(p_radius_m / 11.1)::int + 1 as dlat,
           ceil(p_radius_m / (11.1 * greatest(cos(radians(lat)), 0.01)))::int + 1 as dlng
  ),
  neighbours as (
    select p.lat_e4, p.lng_e4
      from public.places p, box b
     where p.lat_e4 between p_lat_e4 - b.dlat and p_lat_e4 + b.dlat
       and p.lng_e4 between p_lng_e4 - b.dlng and p_lng_e4 + b.dlng
    union all
    select g.lat_e4, g.lng_e4
      from public.capture_grants g, box b
     where g.wallet <> p_wallet
       and g.granted_at > now() - interval '15 minutes'
       and g.lat_e4 between p_lat_e4 - b.dlat and p_lat_e4 + b.dlat
       and g.lng_e4 between p_lng_e4 - b.dlng and p_lng_e4 + b.dlng
  ),
  distances as (
    select st_distance(
             st_setsrid(st_makepoint(n.lng_e4 / 10000.0, n.lat_e4 / 10000.0), 4326)::geography,
             st_setsrid(st_makepoint(lng, lat), 4326)::geography
           ) as d
      from neighbours n
  )
  select
    (select count(*)::int
       from public.capture_grants g
      where g.wallet = p_wallet
        and g.granted_at > now() - interval '24 hours'
        and (g.lat_e4, g.lng_e4) <> (p_lat_e4, p_lng_e4)),
    (select min(d) from distances where d < p_radius_m)
$$;
