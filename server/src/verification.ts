/**
 * Seuils de la vérification GPS, partagés par les deux routes co-signantes.
 * Ils doivent rester alignés sur le client (`app/components/mint/verify-capture.ts`,
 * `app/components/place/verify-visit.ts`) : le client filtre pour ne pas faire
 * perdre un aller-retour à l'utilisateur, le serveur tranche.
 */

/** Un fix moins précis que ça ne distingue pas deux cellules de 11 m. */
export const MAX_ACCURACY_M = 25

/** ~900 km/h : au-delà, le déplacement depuis le dernier événement est implausible. */
export const MAX_SPEED_M_S = 250

/**
 * Rayon admis autour du centre de la cellule pour une visite. Plus large que
 * la cellule elle-même (~11 m) : on prouve une présence sur un lieu, pas un
 * alignement au décimètre, et le fix GPS lui-même est admis jusqu'à 25 m.
 */
export const MAX_VISIT_DISTANCE_M = 50

/**
 * Captures co-signées par wallet sur 24 h glissantes (#45). Freine le farming
 * de cellules, pas le sybil : 10 wallets = 10 fois le quota. Le but est de
 * rendre l'abus fastidieux, pas impossible.
 */
export const MAX_CAPTURES_PER_DAY = 5

/**
 * Wallet « SKR-backed » : au moins `SKR_BACKED_MIN_STAKE` SKR stakés sur
 * mainnet (src/skr.ts). Le stake est bloqué 48 h avant retrait : c'est une mise
 * en jeu que dix wallets sybils ne se repassent pas. En échange, le quota de
 * captures double.
 */
export const SKR_BACKED_MIN_STAKE = 1000
export const SKR_BACKED_CAPTURES_PER_DAY = 10

export function isSkrBacked(stakedSkr: number): boolean {
  return stakedSkr >= SKR_BACKED_MIN_STAKE
}

export function dailyCaptureLimit(stakedSkr: number): number {
  return isSkrBacked(stakedSkr) ? SKR_BACKED_CAPTURES_PER_DAY : MAX_CAPTURES_PER_DAY
}

/**
 * Distance minimale entre une capture et un lieu existant (#46). Égale au
 * rayon de visite : près d'un lieu, on le visite, on ne capture pas à côté.
 */
export const MIN_PLACE_DISTANCE_M = MAX_VISIT_DISTANCE_M

export type CaptureLimitRejection =
  | { reason: 'daily_quota'; limit: number }
  | { reason: 'too_close'; distanceM: number }

/**
 * Juge des limites d'une capture pour un quota donné (5, ou 10 si le wallet
 * est SKR-backed) : rend le refus, ou null si elle passe.
 */
export function captureLimitJudge(dailyLimit: number) {
  return (limits: { capturesToday: number; nearestM: number | null }): CaptureLimitRejection | null => {
    if (limits.nearestM !== null && limits.nearestM < MIN_PLACE_DISTANCE_M) {
      return { reason: 'too_close', distanceM: Math.round(limits.nearestM) }
    }
    if (limits.capturesToday >= dailyLimit) {
      return { reason: 'daily_quota', limit: dailyLimit }
    }
    return null
  }
}

const EARTH_RADIUS_M = 6_371_008.8

/**
 * Distance orthodromique (haversine). Suffisante ici : sur 50 m l'écart avec
 * le calcul ellipsoïdal de PostGIS est millimétrique, et ça évite un
 * aller-retour base sur le chemin critique d'une co-signature.
 */
export function distanceM(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
): number {
  const toRad = Math.PI / 180
  const dLat = (to.latitude - from.latitude) * toRad
  const dLng = (to.longitude - from.longitude) * toRad
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(from.latitude * toRad) * Math.cos(to.latitude * toRad) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)))
}
