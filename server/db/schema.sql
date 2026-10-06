-- Schéma PlaceKeepr pour un Postgres + PostGIS nu (VPS).
--
-- ⚠️ Ce fichier n'est joué que par l'entrypoint de l'image Postgres, au **tout
-- premier** démarrage d'un volume vide. Sur une base déjà en service (le VPS
-- depuis le 10/09/2026) il ne change plus rien : toute évolution de schéma
-- passe AUSSI par un fichier de `db/migrations/`, appliqué au démarrage de
-- l'API (`src/migrate.ts`). Ce fichier reste la forme courante, lisible d'un
-- coup d'œil ; les migrations sont le chemin d'exécution.
--
-- Dérivé de supabase/migrations/, dont il reprend **à l'identique** les tables,
-- index et fonctions. Ce qui a été retiré, et pourquoi :
--   - `alter table … enable row level security` + policies `to anon` : le rôle
--     `anon` est une invention Supabase (PostgREST). Ici aucun client ne parle
--     à Postgres : tout passe par l'API, qui valide côté serveur. C'est le
--     durcissement que la roadmap réclamait.
--   - `storage.buckets` / `storage.objects` : le stockage est un répertoire sur
--     disque servi par Caddy, pas une table.
--   - `verifier_secrets` : créée puis supprimée dans l'historique, sans objet.
--
-- PostGIS vit dans `public`, pas dans `extensions` comme chez Supabase :
-- l'image postgis/postgis pose l'extension dans `public` via template1, AVANT
-- ce script — un `with schema extensions` y est silencieusement ignoré et
-- laisse le type `extensions.geography` introuvable (l'init échoue, Postgres
-- ne démarre pas).
--
-- Conséquence : le type de colonne est écrit sans qualification. Les corps de
-- fonctions, eux, restent identiques à la production Supabase — ils n'appellent
-- PostGIS que sans qualification et leur `search_path` couvre les deux cas.
-- Le schéma `extensions` est créé vide pour que ce `search_path` reste valide.

create schema if not exists extensions;
create extension if not exists postgis;

-- Résolution de `geography` et des fonctions st_* à la création des objets.
set search_path = public, extensions;

-- ── Journal des mints ───────────────────────────────────────────────────────
-- Contrainte CLAUDE.md : toute interaction on-chain à revenu potentiel est
-- logguée ici pour la comptabilité future.
create table if not exists public.mints (
  id uuid primary key default gen_random_uuid(),
  signature text not null unique,
  minter text not null,
  location geography(point, 4326) not null,
  photo_path text,
  thumb_path text,
  metadata_path text,
  cluster text not null default 'devnet',
  rpc_endpoint text,
  minted_at timestamptz not null,
  created_at timestamptz not null default now(),
  -- Confirmation par l'indexer Helius. Null = ligne déclarée par le client,
  -- pas encore vue on-chain.
  indexed_at timestamptz,
  -- Lieu retiré par la modération (app/scripts/remove-places.ts) : la ligne
  -- reste, c'est la comptabilité, mais elle ne s'affiche plus nulle part.
  hidden_at timestamptz
);

create index if not exists mints_location_gix on public.mints using gist (location);
create index if not exists mints_minter_idx on public.mints (minter);

-- ── Miroir du registre on-chain ─────────────────────────────────────────────
-- Alimenté par l'indexer, jamais par le client. La chaîne reste la source de
-- vérité ; ces tables servent aux compteurs, aux jointures et à la comptabilité.
create table if not exists public.places (
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

create index if not exists places_keeper_idx on public.places (keeper);

-- État courant des likes : une ligne par PDA Like on-chain (couple lieu/likeur,
-- le PDA est stable). unliked_at null = like actif ; un re-like réactive la
-- même ligne. Pas de FK vers places : un indexer doit encaisser les événements
-- dans le désordre.
create table if not exists public.likes (
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

create index if not exists likes_place_active_idx on public.likes (place_pda) where unliked_at is null;
create index if not exists likes_liker_idx on public.likes (liker);

-- Visites vérifiées (Phase 4). La chaîne garde l'agrégat (PDA Visit : compteur
-- + cooldown 24 h) ; le détail de chaque passage n'existe QUE ici, posé par
-- l'indexer. `visit_count` est recalculé depuis visit_events, jamais
-- incrémenté : un rejeu Helius ne doit pas gonfler le compteur.
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

-- ── Royalties (Phase 4) ─────────────────────────────────────────────────────
-- Journal comptable des mouvements de cagnotte, alimenté par l'indexer.
-- Contrainte CLAUDE.md : toute interaction on-chain qui produit un revenu doit
-- être loggée proprement. L'app, elle, lit les soldes **on-chain** — ce miroir
-- sert la comptabilité et l'historique, jamais la décision de distribuer.
--
-- `amount_lamports` : pour un dépôt, l'argument de l'instruction (exact) ;
-- pour une distribution, la baisse de solde du vault lue dans le payload
-- Helius — le programme calcule le montant, il n'est nulle part dans
-- l'instruction. Null si le payload ne porte pas la variation de solde : on
-- garde l'événement plutôt que de le perdre. Les parts ne sont volontairement
-- pas stockées : les recalculer ici dupliquerait le barème du programme, et
-- deux barèmes finissent toujours par diverger en silence.
create table if not exists public.royalty_events (
  signature text not null,
  -- Index de l'instruction dans la transaction : l'app peut grouper trois
  -- distributions dans une seule tx, la signature seule ne les distingue pas.
  instruction_index integer not null,
  kind text not null check (kind in ('deposit', 'distribution')),
  place_pda text not null,
  vault_pda text not null,
  -- Dépôt : qui a payé. Distribution : le gardien crédité.
  counterparty text,
  amount_lamports bigint,
  -- Distribution seulement : nombre de likeurs récents servis.
  liker_count integer,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (signature, instruction_index)
);

create index if not exists royalty_events_place_idx on public.royalty_events (place_pda, occurred_at desc);
create index if not exists royalty_events_counterparty_idx on public.royalty_events (counterparty, occurred_at desc);

-- ── Profils gardiens (pseudo + avatar) ──────────────────────────────────────
-- Purement off-chain : un pseudo ne demande aucun consensus, et l'avatar est
-- une image qui passe par /assets de toute façon. Seule table du miroir qui ne
-- se rejoue PAS depuis la chaîne — c'est de l'affichage, pas de la preuve.
create table if not exists public.profiles (
  wallet text primary key,
  display_name text,
  avatar_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Unicité insensible à la casse, sur les pseudos posés seulement.
create unique index if not exists profiles_display_name_key
  on public.profiles (lower(display_name))
  where display_name is not null;

-- ── Fonctions géospatiales (identiques à la production Supabase) ────────────

-- Distance et délai depuis la dernière capture d'un minter — matière première
-- du contrôle de vitesse de déplacement (route /verify-capture).
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

-- Dernier événement physique d'un wallet, capture OU visite — matière première
-- du contrôle de vitesse (routes /verify-capture et /verify-visit). Généralise
-- travel_check, qui ne voyait que les mints : alterner mint et visite
-- permettait de se téléporter entre deux contrôles.
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

-- Limites de capture (#45 quota par jour, #46 distance minimale).
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

-- nearby_places v4 (+ filtre hidden_at depuis la migration 0006) : dédup par cellule (~11 m) + compteurs likes et passages
-- + visiteurs distincts (#44, lieu « confirmé » à partir d'un seuil que l'app
-- applique : le changer ne demande aucune migration).
-- Plusieurs mints peuvent partager une cellule (historique pré-registre) : on
-- garde la ligne dont la tx a inscrit la cellule au registre, sinon la plus
-- ancienne (l'esprit « premier arrivé = gardien »).
create or replace function public.nearby_places(lat double precision, lng double precision, radius_m double precision)
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
    where m.hidden_at is null
      and st_dwithin(m.location, st_setsrid(st_makepoint(lng, lat), 4326)::geography, radius_m)
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
