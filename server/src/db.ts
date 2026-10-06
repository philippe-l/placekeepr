import pg from 'pg'
import { config } from './config.ts'

/**
 * Accès Postgres + PostGIS. Les deux fonctions géospatiales (`nearby_places`,
 * `travel_check`) restent **dans la base**, exactement comme sous Supabase :
 * elles sont portables telles quelles, et l'API n'en est qu'une façade typée.
 */

// `numeric`/`int8` reviennent en string par défaut (précision) : ici les
// compteurs tiennent largement dans un number, on parse pour ne pas propager
// des strings jusqu'à l'app.
pg.types.setTypeParser(pg.types.builtins.INT8, (value) => Number(value))

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  max: 10,
})

export interface NearbyPlaceRow {
  signature: string
  minter: string
  latitude: number
  longitude: number
  photo_path: string | null
  thumb_path: string | null
  minted_at: Date
  distance_m: number
  like_count: number
  visit_count: number
  /** Visiteurs distincts (#44) : le seuil « confirmé » est appliqué par l'app. */
  distinct_visitors: number
}

export async function nearbyPlaces(lat: number, lng: number, radiusM: number): Promise<NearbyPlaceRow[]> {
  const { rows } = await pool.query<NearbyPlaceRow>('select * from public.nearby_places($1, $2, $3)', [
    lat,
    lng,
    radiusM,
  ])
  return rows
}

export interface PlaceRow {
  pda: string
  lat_e4: number
  lng_e4: number
  register_signature: string | null
  distinct_visitors: number
}

export async function placesByKeeper(keeper: string): Promise<PlaceRow[]> {
  const { rows } = await pool.query<PlaceRow>(
    `select p.pda, p.lat_e4, p.lng_e4, p.register_signature,
            (select count(*) from public.visits v where v.place_pda = p.pda)::integer as distinct_visitors
       from public.places p
      where p.keeper = $1`,
    [keeper],
  )
  return rows
}

export interface LikeRow {
  place_pda: string
  liker: string
  liked_at: Date
}

export async function activeLikes(placePdas: string[], limit?: number): Promise<LikeRow[]> {
  const { rows } = await pool.query<LikeRow>(
    `select place_pda, liker, liked_at
       from public.likes
      where place_pda = any($1::text[]) and unliked_at is null
      order by liked_at desc
      limit $2`,
    [placePdas, limit ?? null],
  )
  return rows
}

export async function activeLikeCount(placePda: string): Promise<number> {
  const { rows } = await pool.query<{ count: number }>(
    'select count(*)::int as count from public.likes where place_pda = $1 and unliked_at is null',
    [placePda],
  )
  return rows[0]?.count ?? 0
}

export interface VisitRow {
  place_pda: string
  visitor: string
  visit_count: number
  first_visited_at: Date
  last_visited_at: Date
}

/** Visiteurs d'un lot de lieux, du passage le plus récent au plus ancien. */
export async function placeVisits(placePdas: string[], limit?: number): Promise<VisitRow[]> {
  const { rows } = await pool.query<VisitRow>(
    `select place_pda, visitor, visit_count, first_visited_at, last_visited_at
       from public.visits
      where place_pda = any($1::text[])
      order by last_visited_at desc
      limit $2`,
    [placePdas, limit ?? null],
  )
  return rows
}

/** Total des passages vérifiés sur un lieu, tous visiteurs confondus. */
export async function placeVisitCount(placePda: string): Promise<number> {
  const { rows } = await pool.query<{ count: number }>(
    'select coalesce(sum(visit_count), 0)::int as count from public.visits where place_pda = $1',
    [placePda],
  )
  return rows[0]?.count ?? 0
}

export interface MintSyncRow {
  signature: string
  complete: boolean
}

/**
 * Signatures connues et leur complétude. Une ligne posée par l'indexer arrive
 * sans photo : elle est connue mais incomplète, et l'app doit la compléter.
 */
export async function mintSyncState(): Promise<MintSyncRow[]> {
  const { rows } = await pool.query<MintSyncRow>(
    'select signature, photo_path is not null as complete from public.mints',
  )
  return rows
}

export interface MinterMintRow {
  signature: string
  latitude: number
  longitude: number
  photo_path: string | null
  thumb_path: string | null
  metadata_path: string | null
  cluster: string
  rpc_endpoint: string | null
  minted_at: Date
}

/**
 * Captures d'un wallet, pour reconstruire la collection d'un téléphone neuf ou
 * réinstallé : le journal local de l'app est la source d'affichage, et il
 * disparaît avec l'app. Position précise ici, arrondie à la cellule par la
 * route (donnée publique), et chemins des preuves.
 */
export async function mintsByMinter(minter: string): Promise<MinterMintRow[]> {
  const { rows } = await pool.query<MinterMintRow>(
    `select signature,
            st_y(location::geometry) as latitude,
            st_x(location::geometry) as longitude,
            photo_path, thumb_path, metadata_path, cluster, rpc_endpoint, minted_at
       from public.mints
      where minter = $1
        and hidden_at is null
      order by minted_at`,
    [minter],
  )
  return rows
}

export interface MintInsert {
  signature: string
  minter: string
  latitude: number
  longitude: number
  photoPath: string | null
  thumbPath: string | null
  metadataPath: string | null
  cluster: string
  rpcEndpoint: string | null
  mintedAt: string
}

/**
 * Insère la ligne, ou **complète** celle déjà posée par l'indexer : chemins
 * d'assets manquants et position précise. `coalesce` garantit qu'une preuve
 * déjà déposée n'est jamais écrasée, et `indexed_at` / `minted_at` ne sont
 * jamais touchés. La position n'est reprise que si l'appelant apporte une
 * photo — l'indexer, lui, ne connaît que le centre de la cellule.
 * Rend `true` si la ligne a été créée, `false` si elle a été complétée.
 */
export async function saveMint(mint: MintInsert): Promise<boolean> {
  const { rows } = await pool.query<{ inserted: boolean }>(
    `insert into public.mints
       (signature, minter, location, photo_path, thumb_path, metadata_path, cluster, rpc_endpoint, minted_at)
     values ($1, $2, st_setsrid(st_makepoint($3, $4), 4326)::geography, $5, $6, $7, $8, $9, $10)
     on conflict (signature) do update set
       -- La valeur EXISTANTE gagne : une preuve déposée n'est jamais remplacée.
       -- (L'ordre inverse, en place jusqu'au 29/09/2026, laissait n'importe qui
       -- substituer la photo d'un lieu.)
       photo_path    = coalesce(mints.photo_path, excluded.photo_path),
       thumb_path    = coalesce(mints.thumb_path, excluded.thumb_path),
       metadata_path = coalesce(mints.metadata_path, excluded.metadata_path),
       rpc_endpoint  = coalesce(mints.rpc_endpoint, excluded.rpc_endpoint),
       -- La position précise ne complète qu'une ligne de l'indexer (sans photo,
       -- centre de cellule) : une ligne complète ne se déplace plus.
       location      = case when mints.photo_path is null and excluded.photo_path is not null
                            then excluded.location else mints.location end
     returning (xmax = 0) as inserted`,
    [
      mint.signature,
      mint.minter,
      mint.longitude,
      mint.latitude,
      mint.photoPath,
      mint.thumbPath,
      mint.metadataPath,
      mint.cluster,
      mint.rpcEndpoint,
      mint.mintedAt,
    ],
  )
  return rows[0]?.inserted ?? false
}

export interface TravelCheckRow {
  distance_m: number
  seconds_elapsed: number
}

/**
 * Distance/délai depuis le dernier événement physique du wallet — capture ou
 * visite. Vide = aucun antécédent, rien à contrôler.
 *
 * `travel_check` (mints seuls) reste en base pour l'historique, mais n'est plus
 * appelée : elle laissait passer l'alternance mint/visite, chaque moitié de
 * l'historique étant invisible à l'autre.
 */
export async function presenceCheck(wallet: string, lat: number, lng: number): Promise<TravelCheckRow | undefined> {
  const { rows } = await pool.query<TravelCheckRow>('select * from public.presence_check($1, $2, $3)', [
    wallet,
    lat,
    lng,
  ])
  return rows[0]
}

// ── Limites de capture (#45 quota, #46 distance) ────────────────────────────

export interface CaptureCell {
  wallet: string
  latitude: number
  longitude: number
  latE4: number
  lngE4: number
}

export interface CaptureLimits {
  /** Cellules co-signées au wallet sur 24 h, hors la cellule visée. */
  capturesToday: number
  /** Lieu le plus proche dans le rayon demandé, null si aucun. */
  nearestM: number | null
}

async function readCaptureLimits(client: pg.Pool | pg.PoolClient, cell: CaptureCell, radiusM: number) {
  const { rows } = await client.query<{ captures_today: number; nearest_m: number | null }>(
    'select * from public.capture_limits($1, $2, $3, $4, $5, $6)',
    [cell.wallet, cell.latitude, cell.longitude, cell.latE4, cell.lngE4, radiusM],
  )
  const row = rows[0]
  return {
    capturesToday: Number(row?.captures_today ?? 0),
    nearestM: row?.nearest_m == null ? null : Number(row.nearest_m),
  }
}

/** Lecture seule : le pré-contrôle au déclenchement, avant photo et uploads. */
export async function captureLimits(cell: CaptureCell, radiusM: number): Promise<CaptureLimits> {
  return readCaptureLimits(pool, cell, radiusM)
}

/**
 * Contrôle + enregistrement de la co-signature, atomiques. `judge` rend le
 * refus (ou null) à partir des limites lues ; la ligne `capture_grants`
 * n'est écrite que sans refus.
 *
 * Verrou consultatif GLOBAL, pas par wallet : il sérialise aussi deux wallets
 * qui captureraient deux cellules voisines au même instant — sinon chacun
 * passerait le contrôle de distance sans voir l'autre. Une capture est un
 * événement rare, la contention est nulle.
 */
export async function grantCapture<R>(
  cell: CaptureCell,
  radiusM: number,
  judge: (limits: CaptureLimits) => R | null,
): Promise<R | null> {
  const client = await pool.connect()
  try {
    await client.query('begin')
    await client.query("select pg_advisory_xact_lock(hashtext('capture_grants'))")
    const rejection = judge(await readCaptureLimits(client, cell, radiusM))
    if (rejection === null) {
      await client.query(
        `insert into public.capture_grants (wallet, lat_e4, lng_e4) values ($1, $2, $3)
         on conflict (wallet, lat_e4, lng_e4) do update set granted_at = now()`,
        [cell.wallet, cell.latE4, cell.lngE4],
      )
    }
    await client.query('commit')
    return rejection
  } catch (error) {
    await client.query('rollback').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

// ── Profils gardiens ────────────────────────────────────────────────────────

export interface ProfileRow {
  wallet: string
  display_name: string | null
  avatar_path: string | null
  updated_at: Date
}

export interface ProfileInsert {
  wallet: string
  displayName: string | null
  avatarPath: string | null
}

/** Code Postgres « unique_violation » — ici, un pseudo déjà porté. */
const UNIQUE_VIOLATION = '23505'

export class DisplayNameTaken extends Error {
  constructor(name: string) {
    super(`Pseudo déjà pris : ${name}`)
  }
}

/**
 * Profils d'un lot de wallets. Les wallets sans profil sont simplement absents
 * du résultat — l'app retombe sur l'adresse tronquée, qui reste le défaut.
 */
export async function profiles(wallets: string[]): Promise<ProfileRow[]> {
  const { rows } = await pool.query<ProfileRow>(
    `select wallet, display_name, avatar_path, updated_at
       from public.profiles
      where wallet = any($1::text[])`,
    [wallets],
  )
  return rows
}

/**
 * Pose ou remplace le profil du wallet. Un champ à `null` est un effacement
 * volontaire (retirer son pseudo, retirer son avatar) : pas de `coalesce` ici,
 * contrairement à `saveMint` — un profil n'est pas une preuve, il se modifie.
 */
export async function saveProfile(profile: ProfileInsert): Promise<ProfileRow> {
  try {
    const { rows } = await pool.query<ProfileRow>(
      `insert into public.profiles (wallet, display_name, avatar_path)
       values ($1, $2, $3)
       on conflict (wallet) do update set
         display_name = excluded.display_name,
         avatar_path  = excluded.avatar_path,
         updated_at   = now()
       returning wallet, display_name, avatar_path, updated_at`,
      [profile.wallet, profile.displayName, profile.avatarPath],
    )
    return rows[0]!
  } catch (error) {
    if ((error as { code?: string }).code === UNIQUE_VIOLATION) {
      throw new DisplayNameTaken(profile.displayName ?? '')
    }
    throw error
  }
}
