import { Hono } from 'hono'
import { z } from 'zod'
import { assetContentType, assetExists } from '../assets.ts'
import * as db from '../db.ts'
import { verifyProfileClaim } from '../wallet-auth.ts'

/**
 * Profils gardiens : pseudo + avatar. Lecture publique comme le reste,
 * écriture authentifiée par **signature de message** du wallet concerné
 * (`../wallet-auth.ts`) — sans quoi n'importe qui poserait le pseudo de
 * n'importe qui.
 */

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]+$/
const pubkey = z.string().regex(BASE58).min(32).max(44)

/**
 * Pseudo : 3 à 20 caractères, lettres ASCII / chiffres / `_` / `-`, ni en
 * tête ni en queue pour les deux derniers.
 *
 * Pas d'espace ni d'accent, pour deux raisons : le pseudo s'affiche en Press
 * Start 2P, qui n'a ni l'un ni l'autre ; et l'unicité insensible à la casse
 * resterait ambiguë avec des espaces (« a b » et « a  b » se liraient
 * pareil). Le miroir de cette règle vit dans
 * `app/components/profile/profile-message.ts`.
 */
const DISPLAY_NAME = /^[A-Za-z0-9][A-Za-z0-9_-]{1,18}[A-Za-z0-9]$/

const profileBody = z.object({
  wallet: pubkey,
  displayName: z.string().regex(DISPLAY_NAME).nullable(),
  avatarPath: z.string().max(128).nullable(),
  issuedAt: z.string().datetime({ offset: true }),
  signature: z.string().max(128),
})

function toProfile(row: db.ProfileRow) {
  return {
    wallet: row.wallet,
    displayName: row.display_name,
    avatarPath: row.avatar_path,
    updatedAt: row.updated_at.toISOString(),
  }
}

export const profiles = new Hono()

profiles.get('/profiles', async (c) => {
  const raw = c.req.query('wallets')
  if (!raw) {
    return c.json({ error: 'bad_request' }, 400)
  }
  const wallets = raw.split(',').filter(Boolean)
  if (wallets.length === 0 || wallets.length > 200 || !wallets.every((w) => pubkey.safeParse(w).success)) {
    return c.json({ error: 'bad_request' }, 400)
  }
  const rows = await db.profiles(wallets)
  return c.json(rows.map(toProfile))
})

profiles.put('/profiles', async (c) => {
  let payload: unknown
  try {
    payload = await c.req.json()
  } catch {
    return c.json({ error: 'bad_request' }, 400)
  }
  const body = profileBody.safeParse(payload)
  if (!body.success) {
    return c.json({ error: 'bad_request', details: body.error.flatten().fieldErrors }, 400)
  }

  const { signature, ...claim } = body.data
  const failure = verifyProfileClaim(claim, signature)
  if (failure) {
    return c.json({ error: failure }, 401)
  }

  if (claim.avatarPath !== null) {
    // L'avatar doit être une image déjà déposée : sinon un profil pointerait
    // sur un 404 permanent, et `assetContentType` est ce qui interdit au
    // passage un chemin hors du répertoire d'assets.
    if (!assetContentType(claim.avatarPath)?.startsWith('image/')) {
      return c.json({ error: 'bad_request', reason: 'avatar_type' }, 400)
    }
    if (!(await assetExists(claim.avatarPath))) {
      return c.json({ error: 'bad_request', reason: 'avatar_missing' }, 400)
    }
  }

  try {
    return c.json(toProfile(await db.saveProfile(claim)))
  } catch (error) {
    if (error instanceof db.DisplayNameTaken) {
      return c.json({ error: 'name_taken' }, 409)
    }
    throw error
  }
})
