-- Lieu « confirmé » (#44) : nearby_places v4 expose le nombre de visiteurs
-- distincts. Le seuil vit dans l'app (CONFIRMED_MIN_VISITORS) : ce compteur
-- est une donnée brute, pas un verdict.
--
-- Rejouable (règle de src/migrate.ts) : le type de retour change, `create or
-- replace` le refuserait — on supprime puis recrée, dans la transaction de la
-- migration (aucune fenêtre sans fonction pour les requêtes concurrentes).
drop function if exists public.nearby_places(double precision, double precision, double precision);

-- nearby_places v4 : dédup par cellule (~11 m) + compteurs likes et passages
-- + visiteurs distincts (#44, lieu « confirmé » à partir d'un seuil que l'app
-- applique : le changer ne demande aucune migration).
-- Plusieurs mints peuvent partager une cellule (historique pré-registre) : on
-- garde la ligne dont la tx a inscrit la cellule au registre, sinon la plus
-- ancienne (l'esprit « premier arrivé = gardien »).
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
  visit_count integer,
  distinct_visitors integer
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
    )::integer as visit_count,
    -- `visits` a une ligne par couple (lieu, visiteur) : compter les lignes,
    -- c'est compter les visiteurs distincts. L'auto-visite est interdite
    -- on-chain, le gardien n'y figure donc jamais.
    (select count(*) from public.visits v where v.place_pda = d.place_pda)::integer as distinct_visitors
  from deduped d
  order by d.distance_m
$$;
