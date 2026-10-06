import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Hono } from 'hono'
import { z } from 'zod'
import { AssetExists, AssetRejected, assetContentType, checkAssetName, writeAsset } from '../assets.ts'
import { config } from '../config.ts'
import * as db from '../db.ts'
import { proveCapture } from '../mint-proof.ts'
import { skrStaked } from '../skr.ts'
import { SKR_BACKED_MIN_STAKE, dailyCaptureLimit, isSkrBacked } from '../verification.ts'

/**
 * Les routes de données + le dépôt d'assets. L'API parle exactement la langue
 * du contrat `Backend` de l'app (camelCase, dates ISO) : le client HTTP est un
 * passe-plat, aucun remapping des deux côtés.
 *
 * Lectures : publiques (lieux et likes sont publics par design).
 * Écritures : validées côté serveur — c'est ce que la RLS anon de Supabase ne
 * faisait pas.
 */

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]+$/
const pubkey = z.string().regex(BASE58).min(32).max(44)
const signature = z.string().regex(BASE58).min(64).max(90)

const nearbyQuery = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radius_m: z.coerce.number().positive().max(500_000),
})

const byPlacesQuery = z.object({
  places: z.string().min(1),
  limit: z.coerce.number().int().positive().max(500).optional(),
})

const mintBody = z.object({
  signature,
  minter: pubkey,
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  photoPath: z.string().max(128).nullable(),
  thumbPath: z.string().max(128).nullable(),
  metadataPath: z.string().max(128).nullable(),
  cluster: z.enum(['devnet', 'testnet', 'mainnet-beta', 'custom']),
  rpcEndpoint: z.string().url().max(512).nullable(),
  mintedAt: z.string().datetime({ offset: true }),
})

/**
 * Position publique arrondie à la cellule de la grille (~11 m), celle que la
 * chaîne connaît de toute façon. La position précise de la capture n'est pas
 * donnée publique : capturer près de chez soi la localisait au mètre près
 * (audit du 29/09/2026). Elle reste en base pour le contrôle de vitesse.
 */
function toCell(value: number): number {
  return Math.round(value * 10_000) / 10_000
}

export const data = new Hono()

data.get('/places/nearby', async (c) => {
  const query = nearbyQuery.safeParse(c.req.query())
  if (!query.success) {
    return c.json({ error: 'bad_request' }, 400)
  }
  const rows = await db.nearbyPlaces(query.data.lat, query.data.lng, query.data.radius_m)
  return c.json(
    rows.map((row) => ({
      signature: row.signature,
      minter: row.minter,
      latitude: toCell(row.latitude),
      longitude: toCell(row.longitude),
      photoPath: row.photo_path,
      thumbPath: row.thumb_path,
      mintedAt: row.minted_at.toISOString(),
      distanceM: row.distance_m,
      likeCount: row.like_count,
      visitCount: row.visit_count,
      distinctVisitors: row.distinct_visitors,
    })),
  )
})

data.get('/places', async (c) => {
  const keeper = pubkey.safeParse(c.req.query('keeper'))
  if (!keeper.success) {
    return c.json({ error: 'bad_request' }, 400)
  }
  const rows = await db.placesByKeeper(keeper.data)
  return c.json(
    rows.map((row) => ({
      pda: row.pda,
      latE4: row.lat_e4,
      lngE4: row.lng_e4,
      registerSignature: row.register_signature,
      distinctVisitors: row.distinct_visitors,
    })),
  )
})

/** Lot de PDAs `?places=a,b,c`, validé un par un. Null = requête à rejeter. */
function parsePlaces(raw: string): string[] | null {
  const places = raw.split(',').filter(Boolean)
  if (places.length === 0 || places.length > 500 || !places.every((pda) => pubkey.safeParse(pda).success)) {
    return null
  }
  return places
}

data.get('/likes', async (c) => {
  const query = byPlacesQuery.safeParse(c.req.query())
  if (!query.success) {
    return c.json({ error: 'bad_request' }, 400)
  }
  const places = parsePlaces(query.data.places)
  if (!places) {
    return c.json({ error: 'bad_request' }, 400)
  }
  const rows = await db.activeLikes(places, query.data.limit)
  return c.json(
    rows.map((row) => ({
      placePda: row.place_pda,
      liker: row.liker,
      likedAt: row.liked_at.toISOString(),
    })),
  )
})

data.get('/likes/count', async (c) => {
  const place = pubkey.safeParse(c.req.query('place'))
  if (!place.success) {
    return c.json({ error: 'bad_request' }, 400)
  }
  return c.json({ count: await db.activeLikeCount(place.data) })
})

data.get('/visits', async (c) => {
  const query = byPlacesQuery.safeParse(c.req.query())
  if (!query.success) {
    return c.json({ error: 'bad_request' }, 400)
  }
  const places = parsePlaces(query.data.places)
  if (!places) {
    return c.json({ error: 'bad_request' }, 400)
  }
  const rows = await db.placeVisits(places, query.data.limit)
  return c.json(
    rows.map((row) => ({
      placePda: row.place_pda,
      visitor: row.visitor,
      visitCount: row.visit_count,
      firstVisitedAt: row.first_visited_at.toISOString(),
      lastVisitedAt: row.last_visited_at.toISOString(),
    })),
  )
})

data.get('/visits/count', async (c) => {
  const place = pubkey.safeParse(c.req.query('place'))
  if (!place.success) {
    return c.json({ error: 'bad_request' }, 400)
  }
  return c.json({ count: await db.placeVisitCount(place.data) })
})

data.get('/mints', async (c) => {
  const minter = pubkey.safeParse(c.req.query('minter'))
  if (!minter.success) {
    return c.json({ error: 'bad_request' }, 400)
  }
  const rows = await db.mintsByMinter(minter.data)
  return c.json(
    rows.map((row) => ({
      signature: row.signature,
      latitude: toCell(row.latitude),
      longitude: toCell(row.longitude),
      photoPath: row.photo_path,
      thumbPath: row.thumb_path,
      metadataPath: row.metadata_path,
      cluster: row.cluster,
      rpcEndpoint: row.rpc_endpoint,
      mintedAt: row.minted_at.toISOString(),
    })),
  )
})

data.get('/mints/sync-state', async (c) => {
  const rows = await db.mintSyncState()
  return c.json({
    known: rows.map((row) => row.signature),
    complete: rows.filter((row) => row.complete).map((row) => row.signature),
  })
})

data.post('/mints', async (c) => {
  let payload: unknown
  try {
    payload = await c.req.json()
  } catch {
    return c.json({ error: 'bad_request' }, 400)
  }
  const body = mintBody.safeParse(payload)
  if (!body.success) {
    return c.json({ error: 'bad_request', details: body.error.flatten().fieldErrors }, 400)
  }
  // Une seule chaîne est relue (SOLANA_RPC_URL) : une capture déclarée sur un
  // autre cluster ne peut pas être prouvée ici.
  if (body.data.cluster !== config.cluster) {
    return c.json({ error: 'bad_request', reason: 'cluster' }, 400)
  }
  // Rien n'est écrit sans preuve on-chain (src/mint-proof.ts).
  let proof
  try {
    proof = await proveCapture(body.data.signature, body.data.minter, body.data.latitude, body.data.longitude)
  } catch (error) {
    console.error('prove_capture', error)
    return c.json({ error: 'rpc_unavailable' }, 503)
  }
  if (proof !== 'ok') {
    return c.json({ error: 'unverified', reason: proof }, 422)
  }
  const created = await db.saveMint(body.data)
  // Idempotent : ligne créée (201) ou ligne existante complétée (200).
  return c.json({ ok: true, created }, created ? 201 : 200)
})

/**
 * Lecture d'un asset. Les fichiers vivent dans un volume Docker que le nginx
 * partagé (stack baladezen) ne monte pas : c'est l'API qui les sert, et nginx
 * ne fait que relayer. Le nom passe par la même validation qu'à l'écriture.
 */
/**
 * Statut SKR d'un wallet (prix SKR de CLOCK IN) : SKR staké sur mainnet, lu
 * en lecture seule, et le quota de captures qui en découle. Public — un stake
 * est une donnée on-chain publique.
 */
data.get('/skr/:wallet', async (c) => {
  const wallet = pubkey.safeParse(c.req.param('wallet'))
  if (!wallet.success) {
    return c.json({ error: 'bad_request' }, 400)
  }
  const staked = await skrStaked(wallet.data)
  return c.json({
    staked,
    backed: isSkrBacked(staked),
    dailyCaptures: dailyCaptureLimit(staked),
    minStake: SKR_BACKED_MIN_STAKE,
  })
})

data.get('/assets/:name', async (c) => {
  const name = c.req.param('name')
  const contentType = assetContentType(name)
  if (!contentType) {
    return c.json({ error: 'bad_request' }, 400)
  }
  let file: Buffer
  try {
    file = await readFile(join(config.assetsDir, name))
  } catch {
    return c.json({ error: 'not_found' }, 404)
  }
  // `Buffer` s'appuie sur un ArrayBuffer mutualisé, que la signature de
  // `c.body` refuse : on recopie dans un tampon qui nous appartient.
  const body = new Uint8Array(new ArrayBuffer(file.byteLength))
  body.set(file)
  return c.body(body, 200, {
    'Content-Type': contentType,
    // Une preuve n'est jamais réécrite (création exclusive) : cache immuable.
    'Cache-Control': 'public, max-age=31536000, immutable',
  })
})

data.post('/assets/:name', async (c) => {
  const name = c.req.param('name')
  const contentType = c.req.header('content-type') ?? ''
  try {
    checkAssetName(name, contentType)
  } catch (error) {
    if (error instanceof AssetRejected) {
      return c.json({ error: 'rejected', reason: error.message }, 400)
    }
    throw error
  }

  const declared = Number(c.req.header('content-length') ?? 0)
  if (declared > config.maxAssetBytes) {
    return c.json({ error: 'rejected', reason: 'too_large' }, 413)
  }
  const bytes = new Uint8Array(await c.req.arrayBuffer())

  try {
    return c.json({ url: await writeAsset(name, bytes) }, 201)
  } catch (error) {
    if (error instanceof AssetExists) {
      // Le client décide : rejet (upload pré-mint) ou tolérance (sync).
      return c.json({ error: 'exists' }, 409)
    }
    if (error instanceof AssetRejected) {
      return c.json({ error: 'rejected', reason: error.message }, error.status)
    }
    throw error
  }
})
