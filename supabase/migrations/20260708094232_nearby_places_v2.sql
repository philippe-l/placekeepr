-- nearby_places v2 : dédup par cellule (~11 m) + compteur de likes actifs.
-- Plusieurs mints peuvent partager une cellule (historique pré-registre) : on
-- garde la ligne dont la tx a inscrit la cellule au registre, sinon la plus
-- ancienne (l'esprit « premier arrivé = gardien »).
-- Arrondi cellule : round() SQL (half away from zero) vs Math.round() JS
-- (half up) ne divergent qu'à la frontière exacte de 5e-5 degré — négligeable
-- pour du GPS réel.

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
  like_count integer
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
    )::integer as like_count
  from deduped d
  order by d.distance_m
$$;
