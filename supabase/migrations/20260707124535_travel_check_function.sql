-- Distance et délai depuis la dernière capture d'un minter — matière première
-- du contrôle de vitesse de déplacement (edge function verify-capture).
-- Aucune ligne = premier mint du wallet.
create or replace function public.travel_check(p_minter text, lat double precision, lng double precision)
returns table (distance_m double precision, seconds_elapsed double precision)
language sql
stable
set search_path = public, extensions
as $$
  select
    st_distance(m.location, st_setsrid(st_makepoint(lng, lat), 4326)::geography) as distance_m,
    extract(epoch from (now() - m.minted_at)) as seconds_elapsed
  from public.mints m
  where m.minter = p_minter
  order by m.minted_at desc
  limit 1
$$;
