import { timingSafeEqual } from 'node:crypto'
import bs58 from 'bs58'
import { Hono } from 'hono'
import { config } from '../config.ts'
import { pool } from '../db.ts'

/**
 * Indexer Helius → Postgres — port fidèle de l'edge function Supabase
 * (`supabase/functions/helius-webhook`). Reçoit les transactions « enhanced »
 * du programme place_registry et matérialise l'état on-chain :
 *  - register_place : réconcilie `mints` (indexed_at posé sur les lignes
 *    déclarées par l'app, insertion des tx inconnues — précision cellule,
 *    sans photos) et alimente le miroir `places` ;
 *  - like_place / unlike_place : miroir `likes` (état courant par PDA Like,
 *    unliked_at null = like actif ; un re-like réactive la même ligne) ;
 *  - visit_place : historique des passages (`visit_events`) et agrégat par
 *    couple lieu/visiteur (`visits`). Le compteur est **recalculé** depuis
 *    l'historique, jamais incrémenté — Helius rejoue les lots ;
 *  - deposit_royalty / distribute_royalties : journal comptable
 *    (`royalty_events`). L'app lit les cagnottes on-chain, jamais ici : ce
 *    miroir sert la comptabilité, pas la décision de distribuer.
 *
 * Auth : header Authorization = HELIUS_WEBHOOK_SECRET (authHeader du webhook).
 * Fail-closed. Pas de transaction englobante : les écritures sont idempotentes,
 * et Helius rejoue le lot sur réponse non-2xx.
 */

// sha256("global:<instruction>")[0..8]
const REGISTER_DISCRIMINATOR = [193, 120, 229, 116, 127, 194, 89, 143]
const LIKE_DISCRIMINATOR = [123, 180, 28, 220, 62, 162, 150, 142]
const UNLIKE_DISCRIMINATOR = [227, 235, 21, 227, 78, 43, 45, 164]
const VISIT_DISCRIMINATOR = [52, 252, 206, 187, 105, 253, 222, 129]
const DEPOSIT_DISCRIMINATOR = [234, 6, 85, 217, 36, 30, 33, 127]
const DISTRIBUTE_DISCRIMINATOR = [231, 198, 160, 162, 181, 219, 140, 100]

/** Comptes fixes de distribute_royalties : place, vault, keeper,
 *  treasury_config, treasury — le reste sont les likeurs récents. */
const DISTRIBUTE_FIXED_ACCOUNTS = 5

interface HeliusInstruction {
  programId?: string
  data?: string
  accounts?: string[]
}

interface HeliusAccountData {
  account?: string
  nativeBalanceChange?: number
}

interface HeliusTransaction {
  signature?: string
  timestamp?: number
  instructions?: HeliusInstruction[]
  accountData?: HeliusAccountData[]
}

/**
 * Variation de solde d'un compte sur la transaction. Seule source du montant
 * d'une distribution : le programme le calcule, il n'apparaît dans aucun
 * argument d'instruction. Attribuable sans ambiguïté parce qu'une
 * distribution ne touche qu'un vault — contrairement au gardien, qui peut
 * être crédité par plusieurs distributions groupées dans la même tx.
 */
function balanceChange(tx: HeliusTransaction, account: string): number | null {
  const entry = tx.accountData?.find((data) => data.account === account)
  return typeof entry?.nativeBalanceChange === 'number' ? entry.nativeBalanceChange : null
}

function decodeData(ix: HeliusInstruction): Uint8Array | null {
  if (ix.programId !== config.placeRegistryProgram || typeof ix.data !== 'string') {
    return null
  }
  try {
    return bs58.decode(ix.data)
  } catch {
    return null
  }
}

function matches(bytes: Uint8Array, discriminator: number[], length: number): boolean {
  return bytes.length === length && discriminator.every((byte, i) => bytes[i] === byte)
}

/** Comparaison à temps constant : le secret ne doit pas fuir par la latence. */
function secretMatches(provided: string | undefined, expected: string): boolean {
  if (!provided) {
    return false
  }
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

export const heliusWebhook = new Hono()

heliusWebhook.post('/helius-webhook', async (c) => {
  if (!config.heliusWebhookSecret) {
    console.error('HELIUS_WEBHOOK_SECRET manquant')
    return c.json({ error: 'not_configured' }, 503)
  }
  if (!secretMatches(c.req.header('authorization'), config.heliusWebhookSecret)) {
    return c.json({ error: 'unauthorized' }, 401)
  }

  let payload: HeliusTransaction[]
  try {
    payload = await c.req.json()
  } catch {
    return c.json({ error: 'bad_request' }, 400)
  }
  if (!Array.isArray(payload)) {
    return c.json({ error: 'bad_request' }, 400)
  }

  let confirmed = 0
  let inserted = 0
  let liked = 0
  let unliked = 0
  let visited = 0
  let deposited = 0
  let distributed = 0

  try {
    for (const tx of payload) {
      if (typeof tx.signature !== 'string') {
        continue
      }
      const blockTime = new Date((tx.timestamp ?? Math.floor(Date.now() / 1000)) * 1000).toISOString()

      for (const [instructionIndex, ix] of (tx.instructions ?? []).entries()) {
        const bytes = decodeData(ix)
        if (!bytes) {
          continue
        }

        if (matches(bytes, REGISTER_DISCRIMINATOR, 16)) {
          // Comptes : keeper, place, config, verifier, system.
          const [keeper, placePda] = ix.accounts ?? []
          if (typeof keeper !== 'string' || typeof placePda !== 'string') {
            continue
          }
          const view = new DataView(bytes.buffer, bytes.byteOffset)
          const latE4 = view.getInt32(8, true)
          const lngE4 = view.getInt32(12, true)

          await pool.query(
            `insert into public.places (pda, keeper, lat_e4, lng_e4, register_signature, registered_at)
             values ($1, $2, $3, $4, $5, $6)
             on conflict (pda) do update set
               keeper = excluded.keeper,
               lat_e4 = excluded.lat_e4,
               lng_e4 = excluded.lng_e4,
               register_signature = excluded.register_signature,
               registered_at = excluded.registered_at`,
            [placePda, keeper, latE4, lngE4, tx.signature, blockTime],
          )

          const { rows } = await pool.query<{
            id: string
            indexed_at: Date | null
          }>('select id, indexed_at from public.mints where signature = $1', [tx.signature])
          const existing = rows[0]
          if (existing) {
            if (!existing.indexed_at) {
              await pool.query('update public.mints set indexed_at = $1 where id = $2', [blockTime, existing.id])
              confirmed++
            }
          } else {
            await pool.query(
              `insert into public.mints (signature, minter, location, cluster, minted_at, indexed_at)
               values ($1, $2, st_setsrid(st_makepoint($3, $4), 4326)::geography, $5, $6, $7)
               on conflict (signature) do nothing`,
              // Précision cellule (~11 m) : l'indexer ne connaît que la grille.
              [tx.signature, keeper, lngE4 / 10_000, latE4 / 10_000, config.cluster, blockTime, blockTime],
            )
            inserted++
          }
        } else if (matches(bytes, LIKE_DISCRIMINATOR, 8)) {
          // Comptes : liker, place, like, keeper_stats, system.
          const [liker, placePda, likePda] = ix.accounts ?? []
          if (typeof liker !== 'string' || typeof placePda !== 'string' || typeof likePda !== 'string') {
            continue
          }
          await pool.query(
            `insert into public.likes (pda, place_pda, liker, liked_at, unliked_at, like_signature, unlike_signature)
             values ($1, $2, $3, $4, null, $5, null)
             on conflict (pda) do update set
               place_pda = excluded.place_pda,
               liker = excluded.liker,
               liked_at = excluded.liked_at,
               unliked_at = null,
               like_signature = excluded.like_signature,
               unlike_signature = null`,
            [likePda, placePda, liker, blockTime, tx.signature],
          )
          liked++
        } else if (matches(bytes, UNLIKE_DISCRIMINATOR, 8)) {
          // Comptes : liker, place, like, keeper_stats.
          const likePda = ix.accounts?.[2]
          if (typeof likePda !== 'string') {
            continue
          }
          const { rowCount } = await pool.query(
            'update public.likes set unliked_at = $1, unlike_signature = $2 where pda = $3',
            [blockTime, tx.signature, likePda],
          )
          if (!rowCount) {
            // Unlike d'un like jamais indexé (trou d'indexation) : rien à
            // désactiver, on trace sans échouer.
            console.warn('unlike sans like indexé', likePda, tx.signature)
          }
          unliked++
        } else if (matches(bytes, VISIT_DISCRIMINATOR, 8)) {
          // Comptes : visitor, place, config, verifier, visit, keeper_stats, system.
          const [visitor, placePda] = ix.accounts ?? []
          const visitPda = ix.accounts?.[4]
          if (typeof visitor !== 'string' || typeof placePda !== 'string' || typeof visitPda !== 'string') {
            continue
          }
          // L'historique d'abord : c'est lui qui porte la vérité du compteur.
          await pool.query(
            `insert into public.visit_events (signature, visit_pda, place_pda, visitor, visited_at)
             values ($1, $2, $3, $4, $5)
             on conflict (signature, visit_pda) do nothing`,
            [tx.signature, visitPda, placePda, visitor, blockTime],
          )
          // Puis l'agrégat, recalculé — un rejeu du lot retombe sur le même
          // compteur au lieu de l'incrémenter deux fois.
          await pool.query(
            `insert into public.visits
               (pda, place_pda, visitor, visit_count, first_visited_at, last_visited_at, last_signature)
             select $1, $2, $3, count(*)::int, min(e.visited_at), max(e.visited_at),
                    (select f.signature from public.visit_events f
                      where f.visit_pda = $1 order by f.visited_at desc limit 1)
               from public.visit_events e
              where e.visit_pda = $1
             on conflict (pda) do update set
               place_pda = excluded.place_pda,
               visitor = excluded.visitor,
               visit_count = excluded.visit_count,
               first_visited_at = excluded.first_visited_at,
               last_visited_at = excluded.last_visited_at,
               last_signature = excluded.last_signature`,
            [visitPda, placePda, visitor],
          )
          visited++
        } else if (matches(bytes, DEPOSIT_DISCRIMINATOR, 16)) {
          // Comptes : payer, place, vault, system.
          const [payer, placePda, vaultPda] = ix.accounts ?? []
          if (typeof payer !== 'string' || typeof placePda !== 'string' || typeof vaultPda !== 'string') {
            continue
          }
          // Le montant est un argument de l'instruction : exact, sans dépendre
          // du payload Helius.
          const view = new DataView(bytes.buffer, bytes.byteOffset)
          const amount = view.getBigUint64(8, true)
          await pool.query(
            `insert into public.royalty_events
               (signature, instruction_index, kind, place_pda, vault_pda, counterparty, amount_lamports, occurred_at)
             values ($1, $2, 'deposit', $3, $4, $5, $6, $7)
             on conflict (signature, instruction_index) do nothing`,
            [tx.signature, instructionIndex, placePda, vaultPda, payer, amount.toString(), blockTime],
          )
          deposited++
        } else if (matches(bytes, DISTRIBUTE_DISCRIMINATOR, 8)) {
          // Comptes : place, vault, keeper, treasury_config, treasury, puis
          // les likeurs récents servis.
          const [placePda, vaultPda, keeper] = ix.accounts ?? []
          if (typeof placePda !== 'string' || typeof vaultPda !== 'string' || typeof keeper !== 'string') {
            continue
          }
          const likerCount = Math.max((ix.accounts?.length ?? 0) - DISTRIBUTE_FIXED_ACCOUNTS, 0)
          const delta = balanceChange(tx, vaultPda)
          // Le vault ne descend jamais sous son plancher de rent : la baisse
          // observée est exactement ce qui a été réparti.
          const amount = delta === null ? null : Math.max(-delta, 0)
          await pool.query(
            `insert into public.royalty_events
               (signature, instruction_index, kind, place_pda, vault_pda, counterparty, amount_lamports,
                liker_count, occurred_at)
             values ($1, $2, 'distribution', $3, $4, $5, $6, $7, $8)
             on conflict (signature, instruction_index) do nothing`,
            [tx.signature, instructionIndex, placePda, vaultPda, keeper, amount, likerCount, blockTime],
          )
          distributed++
        }
      }
    }
  } catch (error) {
    console.error('helius-webhook', error)
    return c.json({ error: 'server_error' }, 500)
  }

  return c.json({ ok: true, confirmed, inserted, liked, unliked, visited, deposited, distributed })
})
