/**
 * Lieu « confirmé » (#44) : au moins `CONFIRMED_MIN_VISITORS` visiteurs
 * distincts. Une visite est une présence physique co-signée par le vérifieur,
 * faite par un tiers (l'auto-visite est interdite on-chain) : c'est une
 * « proof of interest » vérifiée par des gens venus sur place, bien plus
 * chère à truquer qu'un like.
 *
 * Off-chain et appliqué à l'affichage, comme la pondération de la réputation :
 * le serveur ne rend qu'un compteur brut, changer le seuil ne demande ni
 * migration ni redéploiement. 2 en devnet, pour être atteignable avec les
 * wallets de test — à remonter pour mainnet.
 */
export const CONFIRMED_MIN_VISITORS = 2

export function isConfirmed(distinctVisitors: number): boolean {
  return distinctVisitors >= CONFIRMED_MIN_VISITORS
}
