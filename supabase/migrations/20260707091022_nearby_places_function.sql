-- Lieux à proximité d'un point, du plus proche au plus lointain, via l'index
-- GiST de mints.location. SECURITY INVOKER : la RLS de mints s'applique (anon
-- lit tout, c'est le comportement voulu — les lieux sont publics par design).
create or replace function public.nearby_places(lat double precision, lng double precision, radius_m double precision)
returns table (
  signature text,
  minter text,
  latitude double precision,
  longitude double precision,
  photo_path text,
  thumb_path text,
  minted_at timestamptz,
  distance_m double precision
)
language sql
stable
set search_path = public, extensions
as $$
  select
    m.signature,
    m.minter,
    st_y(m.location::geometry) as latitude,
    st_x(m.location::geometry) as longitude,
    m.photo_path,
    m.thumb_path,
    m.minted_at,
    st_distance(m.location, st_setsrid(st_makepoint(lng, lat), 4326)::geography) as distance_m
  from public.mints m
  where st_dwithin(m.location, st_setsrid(st_makepoint(lng, lat), 4326)::geography, radius_m)
  order by m.location operator(extensions.<->) st_setsrid(st_makepoint(lng, lat), 4326)::geography
$$;
