import { createClient } from 'npm:@supabase/supabase-js@2'
import bs58 from 'npm:bs58@5'

// Indexer Helius → Supabase (Phase 3) : reçoit les transactions « enhanced »
// du programme place_registry et matérialise l'état on-chain.
//  - register_place : réconcilie la table mints (indexed_at posé sur les
//    lignes déclarées par l'app, insertion des tx inconnues — précision
//    cellule, sans photos) et alimente le miroir places ;
//  - like_place / unlike_place : miroir likes (état courant par PDA Like,
//    unliked_at null = like actif ; un re-like réactive la même ligne).
// Auth : Helius envoie le header Authorization = HELIUS_WEBHOOK_SECRET
// (authHeader du webhook, cf. scripts/register-helius-webhook.ts). Fail-closed.
//
// Déployée via MCP/dashboard ; cette copie est la source de vérité du repo.

const PLACE_REGISTRY_PROGRAM = 'EXB4PeyChBveaChFW5nGTqJ2DmNp292cRFo4Ks1aC9pU'
// sha256("global:<instruction>")[0..8]
const REGISTER_DISCRIMINATOR = [193, 120, 229, 116, 127, 194, 89, 143]
const LIKE_DISCRIMINATOR = [123, 180, 28, 220, 62, 162, 150, 142]
const UNLIKE_DISCRIMINATOR = [227, 235, 21, 227, 78, 43, 45, 164]

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

interface HeliusInstruction {
  programId?: string
  data?: string
  accounts?: string[]
}

interface HeliusTransaction {
  signature?: string
  timestamp?: number
  instructions?: HeliusInstruction[]
}

function decodeData(ix: HeliusInstruction): Uint8Array | null {
  if (ix.programId !== PLACE_REGISTRY_PROGRAM || typeof ix.data !== 'string') {
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

Deno.serve(async (req) => {
  const secret = Deno.env.get('HELIUS_WEBHOOK_SECRET')
  if (!secret) {
    console.error('HELIUS_WEBHOOK_SECRET manquant (secrets edge function)')
    return json({ error: 'not_configured' }, 503)
  }
  if (req.headers.get('authorization') !== secret) {
    return json({ error: 'unauthorized' }, 401)
  }
  if (req.method !== 'POST') {
    return json({ error: 'method' }, 405)
  }

  let payload: HeliusTransaction[]
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'bad_request' }, 400)
  }
  if (!Array.isArray(payload)) {
    return json({ error: 'bad_request' }, 400)
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  let confirmed = 0
  let inserted = 0
  let liked = 0
  let unliked = 0

  for (const tx of payload) {
    if (typeof tx.signature !== 'string') {
      continue
    }
    const blockTime = new Date((tx.timestamp ?? Math.floor(Date.now() / 1000)) * 1000).toISOString()

    for (const ix of tx.instructions ?? []) {
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

        const { error: placeError } = await supabase.from('places').upsert(
          {
            pda: placePda,
            keeper,
            lat_e4: latE4,
            lng_e4: lngE4,
            register_signature: tx.signature,
            registered_at: blockTime,
          },
          { onConflict: 'pda' },
        )
        if (placeError) {
          console.error('upsert places', placeError)
          return json({ error: 'server_error' }, 500)
        }

        const { data: existing, error: selectError } = await supabase
          .from('mints')
          .select('id, indexed_at')
          .eq('signature', tx.signature)
          .maybeSingle()
        if (selectError) {
          console.error('select mints', selectError)
          return json({ error: 'server_error' }, 500)
        }

        if (existing) {
          if (!existing.indexed_at) {
            const { error } = await supabase.from('mints').update({ indexed_at: blockTime }).eq('id', existing.id)
            if (error) {
              console.error('update mints', error)
              return json({ error: 'server_error' }, 500)
            }
            confirmed++
          }
        } else {
          const { error } = await supabase.from('mints').insert({
            signature: tx.signature,
            minter: keeper,
            // Précision cellule (~11 m) : l'indexer ne connaît que la grille.
            location: `POINT(${lngE4 / 10_000} ${latE4 / 10_000})`,
            cluster: 'devnet',
            minted_at: blockTime,
            indexed_at: blockTime,
          })
          if (error) {
            console.error('insert mints', error)
            return json({ error: 'server_error' }, 500)
          }
          inserted++
        }
      } else if (matches(bytes, LIKE_DISCRIMINATOR, 8)) {
        // Comptes : liker, place, like, keeper_stats, system.
        const [liker, placePda, likePda] = ix.accounts ?? []
        if (typeof liker !== 'string' || typeof placePda !== 'string' || typeof likePda !== 'string') {
          continue
        }
        const { error } = await supabase.from('likes').upsert(
          {
            pda: likePda,
            place_pda: placePda,
            liker,
            liked_at: blockTime,
            unliked_at: null,
            like_signature: tx.signature,
            unlike_signature: null,
          },
          { onConflict: 'pda' },
        )
        if (error) {
          console.error('upsert likes', error)
          return json({ error: 'server_error' }, 500)
        }
        liked++
      } else if (matches(bytes, UNLIKE_DISCRIMINATOR, 8)) {
        // Comptes : liker, place, like, keeper_stats.
        const likePda = ix.accounts?.[2]
        if (typeof likePda !== 'string') {
          continue
        }
        const { error, count } = await supabase
          .from('likes')
          .update({ unliked_at: blockTime, unlike_signature: tx.signature }, { count: 'exact' })
          .eq('pda', likePda)
        if (error) {
          console.error('update likes', error)
          return json({ error: 'server_error' }, 500)
        }
        if (!count) {
          // Unlike d'un like jamais indexé (trou d'indexation) : rien à
          // désactiver, on trace sans échouer.
          console.warn('unlike sans like indexé', likePda, tx.signature)
        }
        unliked++
      }
    }
  }

  return json({ ok: true, confirmed, inserted, liked, unliked })
})
