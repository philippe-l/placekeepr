import { PublicKey } from '@solana/web3.js'
import nacl from 'tweetnacl'

/**
 * Preuve de possession d'un wallet par signature de message — la seule
 * écriture authentifiée de l'API.
 *
 * Tout le reste s'authentifie autrement : les captures et les visites par la
 * co-signature du vérifieur (le wallet signe la transaction, la chaîne
 * tranche), l'indexer par un secret partagé. Un profil, lui, n'a pas de
 * transaction derrière lui — d'où ce chemin dédié, qui coûte un
 * `signMessage` MWA et aucun SOL.
 *
 * ⚠️ Le message est **reconstruit depuis les champs validés**, jamais reçu tel
 * quel. Accepter le texte du client reviendrait à vérifier une signature sur
 * un message, puis à appliquer un autre contenu — même réflexe que le PDA
 * dérivé plutôt que cru sur parole dans `cosign.ts`.
 */

/** Fenêtre de validité d'un message signé, de part et d'autre de l'horloge serveur. */
export const MAX_SKEW_MS = 5 * 60_000

export interface ProfileClaim {
  wallet: string
  displayName: string | null
  avatarPath: string | null
  issuedAt: string
}

/**
 * Message canonique signé par le wallet. ASCII strict — le pseudo est déjà
 * restreint à `[A-Za-z0-9_-]` par la route, donc aucune surprise d'encodage
 * entre Hermes et Node.
 *
 * **Dupliqué à l'identique dans `app/components/profile/profile-message.ts`.**
 * Toute modification doit toucher les deux fichiers : un client d'une version
 * face à un serveur de l'autre produirait des signatures qui ne vérifient pas,
 * et le symptôme (401 systématique) ne pointe pas vers le format.
 */
export function profileMessage(claim: ProfileClaim): string {
  return [
    'PlaceKeepr profile update',
    `wallet: ${claim.wallet}`,
    `name: ${claim.displayName ?? '-'}`,
    `avatar: ${claim.avatarPath ?? '-'}`,
    `issued: ${claim.issuedAt}`,
  ].join('\n')
}

export type AuthFailure = 'expired' | 'bad_signature'

/**
 * `null` si la signature couvre bien ce claim, le motif de refus sinon.
 *
 * La fenêtre de 5 minutes borne le rejeu : dans cet intervalle, le même
 * message signé peut être renvoyé tel quel. C'est sans effet — il porte le
 * wallet et les valeurs exactes, donc le rejouer réapplique le profil
 * déjà appliqué. Un nonce en base coûterait une table pour empêcher une
 * opération idempotente.
 */
export function verifyProfileClaim(claim: ProfileClaim, signatureBase64: string, now = Date.now()): AuthFailure | null {
  const issued = Date.parse(claim.issuedAt)
  if (!Number.isFinite(issued) || Math.abs(now - issued) > MAX_SKEW_MS) {
    return 'expired'
  }

  let signature: Uint8Array
  let publicKey: Uint8Array
  try {
    signature = new Uint8Array(Buffer.from(signatureBase64, 'base64'))
    publicKey = new PublicKey(claim.wallet).toBytes()
  } catch {
    return 'bad_signature'
  }
  if (signature.length !== nacl.sign.signatureLength) {
    return 'bad_signature'
  }

  const message = new TextEncoder().encode(profileMessage(claim))
  return nacl.sign.detached.verify(message, signature, publicKey) ? null : 'bad_signature'
}
