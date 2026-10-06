import { getBackend } from '@/utils/backend'

/**
 * Vérif de présence d'une visite, symétrique de la capture (Phase 2) :
 *  - client, au déclenchement : position fraîche expo-location, rejet des
 *    positions simulées et des fix trop imprécis (`getVerifiedPosition`) ;
 *  - serveur, avant l'envoi : route `/verify-visit` — distance au centre de la
 *    cellule (≤ 50 m), vitesse de déplacement depuis le dernier événement du
 *    wallet, puis **co-signature** de la transaction.
 *
 * Pas de mode dégradé : le programme exige la signature du vérifieur pour
 * `visit_place`, donc sans backend capable de la produire il n'y a pas de
 * visite — contrairement au mint, qui sait se passer du registre.
 */

export { getVerifiedPosition } from '@/components/mint/verify-capture'

/** Les motifs de la capture, plus la distance au lieu visé. */
// Pas `CaptureRejectionReason | 'too_far'` : le quota et la distance
// minimale sont propres à la capture, une visite ne les rencontre jamais.
export type VisitRejectionReason = 'mock_location' | 'accuracy' | 'travel_speed' | 'too_far'

export class VisitRejected extends Error {
  readonly reason: VisitRejectionReason
  /** Distance mesurée au centre de la cellule (m), servie avec `too_far`. */
  readonly distanceM?: number

  constructor(reason: VisitRejectionReason, distanceM?: number) {
    super(`Visite refusée : ${reason}`)
    this.reason = reason
    this.distanceM = distanceM
  }
}

const SERVER_REASONS: VisitRejectionReason[] = ['mock_location', 'accuracy', 'travel_speed', 'too_far']

export interface VerifyVisitRequest {
  visitor: string
  latE4: number
  lngE4: number
  latitude: number
  longitude: number
  accuracy: number
  message: string
}

/** Signature du vérifieur, exigée par le programme. Jette VisitRejected si refus. */
export async function verifyVisitServer(input: VerifyVisitRequest): Promise<string> {
  const backend = getBackend()
  if (!backend) {
    throw new Error('Backend non configuré — la visite exige la co-signature du vérifieur')
  }
  const result = await backend.verifyVisit(input)
  if (!result.ok) {
    const reason = SERVER_REASONS.find((candidate) => candidate === result.reason)
    throw reason ? new VisitRejected(reason, result.distanceM) : new Error(`Visite refusée : ${result.reason}`)
  }
  if (!result.signature) {
    // Verdict favorable sans signature : le serveur n'a pas son keypair. Rien
    // à envoyer, le programme rejetterait la transaction.
    throw new Error('Co-signature du vérifieur indisponible')
  }
  return result.signature
}
