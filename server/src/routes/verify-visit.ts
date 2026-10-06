import { Hono } from 'hono'
import { z } from 'zod'
import {
  bytesEqual,
  loadVerifier,
  parseMessage,
  placePda,
  signMessage,
  soleProgramInstruction,
  verifierIsSigner,
  verifierOnlyIn,
} from '../cosign.ts'
import { config } from '../config.ts'
import * as db from '../db.ts'
import { MAX_ACCURACY_M, MAX_SPEED_M_S, MAX_VISIT_DISTANCE_M, distanceM } from '../verification.ts'

/**
 * Visite vérifiée : verdict GPS + co-signature de `visit_place`. Même
 * exigence que la capture — le programme refuse la visite sans la signature de
 * ce service, donc la présence physique n'est pas contournable en appelant le
 * programme en direct.
 *
 * **Ce qui lie la position au lieu visité, sans toucher la base** : le client
 * annonce la cellule visée (`latE4`/`lngE4`), le serveur en dérive le PDA et
 * exige que ce soit celui de la transaction, puis vérifie que le fix GPS est à
 * ≤ 50 m du centre de cette cellule. Rien n'est lu dans le miroir : un trou
 * d'indexation ne peut donc ni bloquer une visite légitime, ni en autoriser
 * une fausse.
 *
 * Ce que cette route NE vérifie pas, parce que le programme le fait mieux :
 * le cooldown de 24 h, l'interdiction de l'auto-visite, l'existence du lieu
 * (`Account<Place>` échoue si la cellule n'est pas enregistrée).
 */

// sha256("global:visit_place")[0..8]
const DISCRIMINATOR = Uint8Array.from([52, 252, 206, 187, 105, 253, 222, 129])

// Comptes de visit_place : visitor, place, config, verifier, visit, keeper_stats, system.
const VISITOR_ACCOUNT = 0
const PLACE_ACCOUNT = 1
const VERIFIER_ACCOUNT = 3

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]+$/

const body = z.object({
  visitor: z.string().regex(BASE58).min(32).max(44),
  /** Cellule visée, en 1e-4 degrés — l'app la dérive du lieu affiché. */
  latE4: z.number().int().min(-900_000).max(900_000),
  lngE4: z.number().int().min(-1_800_000).max(1_800_000),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracy: z.number().positive(),
  mocked: z.boolean().optional(),
  /** Message de transaction sérialisé en base64. Obligatoire : une visite
   *  sans transaction n'a pas de sens (pas de mode dégradé, le lieu doit être
   *  au registre pour être visité). */
  message: z.string().min(1),
})

export const verifyVisit = new Hono()

verifyVisit.post('/verify-visit', async (c) => {
  let payload: unknown
  try {
    payload = await c.req.json()
  } catch {
    return c.json({ ok: false, reason: 'bad_request' }, 400)
  }
  const parsedBody = body.safeParse(payload)
  if (!parsedBody.success) {
    return c.json({ ok: false, reason: 'bad_request' }, 400)
  }
  const { visitor, latE4, lngE4, latitude, longitude, accuracy, mocked, message } = parsedBody.data

  if (mocked === true) {
    return c.json({ ok: false, reason: 'mock_location' })
  }
  if (accuracy > MAX_ACCURACY_M) {
    return c.json({ ok: false, reason: 'accuracy' })
  }

  // Présence sur le lieu : le fix doit tomber dans le rayon admis autour du
  // centre de la cellule annoncée.
  const distance = distanceM({ latitude, longitude }, { latitude: latE4 / 10_000, longitude: lngE4 / 10_000 })
  if (distance > MAX_VISIT_DISTANCE_M) {
    return c.json({ ok: false, reason: 'too_far', distanceM: Math.round(distance) })
  }

  let last: { distance_m: number; seconds_elapsed: number } | undefined
  try {
    last = await db.presenceCheck(visitor, latitude, longitude)
  } catch (error) {
    console.error('presence_check', error)
    return c.json({ ok: false, reason: 'server_error' }, 500)
  }
  if (last) {
    const seconds = Math.max(Number(last.seconds_elapsed), 1)
    if (Number(last.distance_m) / seconds > MAX_SPEED_M_S) {
      return c.json({ ok: false, reason: 'travel_speed' })
    }
  }

  const verifier = loadVerifier()
  if (!verifier) {
    console.error('VERIFIER_KEYPAIR manquant')
    return c.json({ ok: false, reason: 'verifier_unavailable' }, 503)
  }

  const parsed = parseMessage(message)
  if (!parsed) {
    return c.json({ ok: false, reason: 'bad_message' }, 400)
  }

  // visit_place, et aucune autre instruction du programme : le vérifieur signe
  // le message entier, pas une instruction (cf. cosign.ts).
  const ix = soleProgramInstruction(parsed.message, config.placeRegistryProgram)
  if (!ix) {
    return c.json({ ok: false, reason: 'bad_message' }, 400)
  }
  if (
    !bytesEqual(ix.data, DISCRIMINATOR) ||
    ix.accounts[VISITOR_ACCOUNT]?.toBase58() !== visitor ||
    ix.accounts[PLACE_ACCOUNT]?.equals(placePda(latE4, lngE4)) !== true ||
    !verifierIsSigner(parsed.message, ix, VERIFIER_ACCOUNT, verifier.publicKey) ||
    // Délégué de l'arbre, le vérifieur pourrait sinon réécrire les
    // métadonnées d'un cNFT glissé dans une visite (cf. cosign.ts).
    !verifierOnlyIn(parsed.message, [ix], verifier.publicKey)
  ) {
    return c.json({ ok: false, reason: 'bad_message' }, 400)
  }

  return c.json({
    ok: true,
    verifier: verifier.publicKey.toBase58(),
    signature: signMessage(parsed.bytes, verifier),
  })
})
