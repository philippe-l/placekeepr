import * as Location from 'expo-location'
import { getBackend } from '@/utils/backend'

/**
 * Vérif GPS d'une capture (Phase 2), en deux temps :
 *  - client, au déclenchement : position fraîche expo-location, rejet des
 *    positions simulées (mock Android) et des fix trop imprécis pour une
 *    grille de 11 m ;
 *  - serveur, juste avant le mint : edge function verify-capture (vitesse de
 *    déplacement depuis la dernière capture — donnée que le client ne
 *    contrôle pas). Consultative tant que le programme n'exige pas de
 *    co-signature vérifieur (itération suivante).
 */

export const MAX_ACCURACY_M = 25

export type CaptureRejectionReason = 'mock_location' | 'accuracy' | 'travel_speed' | 'daily_quota' | 'too_close'

export class CaptureRejected extends Error {
  constructor(
    public readonly reason: CaptureRejectionReason,
    /** `too_close` : distance au lieu existant, en mètres. */
    public readonly distanceM?: number,
    /** `daily_quota` : quota appliqué (5, ou 10 si SKR-backed). */
    public readonly limit?: number,
  ) {
    super(`Capture refusée : ${reason}`)
  }
}

export interface VerifiedPosition {
  latitude: number
  longitude: number
  accuracy: number
}

/** Position fraîche + contrôles locaux. Jette CaptureRejected si suspect. */
export async function getVerifiedPosition(): Promise<VerifiedPosition> {
  let { status } = await Location.getForegroundPermissionsAsync()
  if (status !== 'granted') {
    // Normalement déjà accordée via MapLibre — filet de sécurité.
    status = (await Location.requestForegroundPermissionsAsync()).status
  }
  if (status !== 'granted') {
    throw new Error('Position non autorisée')
  }

  const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High })
  if (current.mocked) {
    throw new CaptureRejected('mock_location')
  }
  const accuracy = current.coords.accuracy
  if (!accuracy || accuracy > MAX_ACCURACY_M) {
    throw new CaptureRejected('accuracy')
  }
  return { latitude: current.coords.latitude, longitude: current.coords.longitude, accuracy }
}

const SERVER_REASONS: CaptureRejectionReason[] = [
  'mock_location',
  'accuracy',
  'travel_speed',
  'daily_quota',
  'too_close',
]

/**
 * Verdict serveur + co-signature. Avec `message` (message de transaction
 * sérialisé en base64), l'edge function inspecte la transaction et renvoie la
 * signature du vérifieur — exigée par le programme place_registry. Sans
 * backend configuré : pas de verdict, retourne null.
 */
export async function verifyCaptureServer(input: {
  minter: string
  latitude: number
  longitude: number
  accuracy: number
  message?: string
}): Promise<string | null> {
  const backend = getBackend()
  if (!backend) {
    return null
  }
  const result = await backend.verifyCapture(input)
  if (!result.ok) {
    const reason = SERVER_REASONS.find((r) => r === result.reason)
    throw reason
      ? new CaptureRejected(reason, result.distanceM, result.limit)
      : new Error(`Vérification refusée : ${result.reason}`)
  }
  return result.signature ?? null
}

/**
 * Pré-contrôle serveur au déclenchement, AVANT la photo : quota du jour,
 * distance au lieu le plus proche, vitesse. Sans lui, ces refus tomberaient
 * à la co-signature — après la photo et les uploads, laissant des assets
 * orphelins. Jette CaptureRejected sur refus. Une panne réseau ne bloque
 * pas : le serveur retranchera à la co-signature.
 */
export async function precheckCapture(input: {
  minter: string
  latitude: number
  longitude: number
  accuracy: number
}): Promise<void> {
  try {
    await verifyCaptureServer(input)
  } catch (error) {
    if (error instanceof CaptureRejected) {
      throw error
    }
    console.warn('Pré-contrôle de capture indisponible', error)
  }
}
