import { Base64 } from 'js-base64'

/**
 * Miroir exact de `server/src/wallet-auth.ts`. Le serveur **reconstruit** le
 * message depuis les champs reçus et vérifie la signature dessus : si les deux
 * formats divergent d'un seul caractère, toute écriture de profil part en 401
 * sans que rien ne désigne le format. Modifier ici, c'est modifier là-bas.
 */

/**
 * Pseudo : 3 à 20 caractères, lettres ASCII / chiffres / `_` / `-`, ni `_` ni
 * `-` aux extrémités. Règle dupliquée dans `server/src/routes/profiles.ts`,
 * qui est celle qui fait foi — celle-ci n'existe que pour refuser en local,
 * avant de déranger le wallet pour une signature vouée au rejet.
 *
 * Pas d'espace ni d'accent : le pseudo s'affiche en Press Start 2P, qui n'a ni
 * l'un ni l'autre.
 */
export const DISPLAY_NAME = /^[A-Za-z0-9][A-Za-z0-9_-]{1,18}[A-Za-z0-9]$/

export interface ProfileClaim {
  wallet: string
  displayName: string | null
  avatarPath: string | null
  issuedAt: string
}

export function profileMessage(claim: ProfileClaim): string {
  return [
    'PlaceKeepr profile update',
    `wallet: ${claim.wallet}`,
    `name: ${claim.displayName ?? '-'}`,
    `avatar: ${claim.avatarPath ?? '-'}`,
    `issued: ${claim.issuedAt}`,
  ].join('\n')
}

/** Octets UTF-8 du message : aller-retour js-base64, `TextEncoder` étant absent de Hermes. */
export function profileMessageBytes(claim: ProfileClaim): Uint8Array {
  return Base64.toUint8Array(Base64.encode(profileMessage(claim)))
}

/** Longueur d'une signature ed25519. */
const SIGNATURE_BYTES = 64

/**
 * Extrait la signature de ce que rend `signMessages`.
 *
 * **Deux conventions coexistent**, et il faut vivre avec les deux :
 *  - la spec MWA décrit un *payload signé* = « message puis signature
 *    concaténés » ;
 *  - le **Seed Vault du Seeker rend la signature seule** (64 octets) —
 *    constaté sur device le 17/09/2026.
 *
 * On ne choisit donc pas, on reconnaît la forme reçue, et tout le reste est
 * refusé bruyamment. Un `.slice(-64)` optimiste aurait fonctionné ici par
 * accident, mais aurait découpé 64 octets au milieu du message face à un
 * wallet respectant la spec — et le serveur aurait répondu 401 sans que rien
 * ne désigne la cause.
 */
export function signatureFromSignedPayload(signed: Uint8Array, message: Uint8Array): Uint8Array {
  if (signed.length === SIGNATURE_BYTES) {
    return signed
  }
  const appended = message.length + SIGNATURE_BYTES
  if (signed.length === appended && message.every((byte, i) => signed[i] === byte)) {
    return signed.slice(message.length)
  }
  throw new Error(
    `Payload signé inattendu : ${signed.length} octets, ni ${SIGNATURE_BYTES} (signature seule) ni ${appended} (message + signature)`,
  )
}
