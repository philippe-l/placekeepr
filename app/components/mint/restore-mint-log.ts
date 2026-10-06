import { mergeMintLog, MintLogEntry, readForgotten, readMintLog } from '@/components/mint/mint-log'
import { clusterFromEndpoint } from '@/components/mint/sync-mint-log'
import { getBackend, placePhotoUrl } from '@/utils/backend'

// Nom d'une photo déposée avant le mint : <placeId>.jpg, placeId = sha256
// tronqué (ou UUID pour les captures d'avant le 10/09/2026).
const PLACE_ID_PHOTO = /^([0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jpg$/

/**
 * Reconstruit la collection d'un wallet depuis le backend. Le journal local
 * (AsyncStorage) est la source d'affichage de l'app — « mes lieux », grille
 * Gardien, badges — et il disparaît avec l'app : réinstaller, changer de
 * téléphone ou passer au build signé pour le dApp Store laissait une
 * collection vide et ses propres lieux affichés « autre gardien ».
 *
 * N'ajoute que ce qui manque, jamais ce que l'utilisateur a retiré
 * (`forgetPlace`), et seulement le cluster courant. Les photos pointent vers
 * le serveur : la preuve d'origine n'existe plus sur ce téléphone, et le
 * serveur ne la réécrit jamais.
 *
 * @returns le nombre d'entrées restaurées.
 */
export async function restoreMintLog(wallet: string, rpcEndpoint: string): Promise<number> {
  const backend = getBackend()
  if (!backend) {
    return 0
  }
  const cluster = clusterFromEndpoint(rpcEndpoint)
  const [remote, local, forgotten] = await Promise.all([backend.mintsByMinter(wallet), readMintLog(), readForgotten()])
  const known = new Set(local.map((entry) => entry.signature))

  const additions: MintLogEntry[] = remote
    .filter((mint) => mint.cluster === cluster && !known.has(mint.signature) && !forgotten.has(mint.signature))
    .map((mint) => ({
      signature: mint.signature,
      latitude: mint.latitude,
      longitude: mint.longitude,
      photoUri: placePhotoUrl(mint.photoPath),
      thumbUri: placePhotoUrl(mint.thumbPath),
      endpoint: mint.rpcEndpoint ?? rpcEndpoint,
      mintedAt: mint.mintedAt,
      minter: wallet,
      placeId: mint.photoPath?.match(PLACE_ID_PHOTO)?.[1],
    }))

  return additions.length > 0 ? mergeMintLog(additions) : 0
}
