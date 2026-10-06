import { File } from 'expo-file-system'
import { MintLogEntry, readMintLog } from '@/components/mint/mint-log'
import { getBackend } from '@/utils/backend'

/**
 * Miroir backend du journal local (ligne comptable + assets), voir CLAUDE.md.
 * Le journal AsyncStorage reste la source d'affichage de l'app ; la sync est
 * best-effort et idempotente : photo d'abord, ligne ensuite. Relancée au
 * démarrage et après chaque mint.
 *
 * Sont poussées les signatures absentes du backend **et** celles dont la ligne
 * existe sans ses assets — l'indexer Helius insère la tx bien avant la sync,
 * avec la seule précision de la cellule et sans photo.
 */

export function clusterFromEndpoint(endpoint: string): string {
  if (endpoint.includes('devnet')) return 'devnet'
  if (endpoint.includes('testnet')) return 'testnet'
  if (endpoint.includes('mainnet')) return 'mainnet-beta'
  return 'custom'
}

let syncing = false

export async function syncMintLog(): Promise<void> {
  const backend = getBackend()
  if (!backend || syncing) {
    return
  }
  syncing = true
  try {
    const entries = await readMintLog()
    if (entries.length === 0) {
      return
    }
    const state = await backend.mintSyncState()
    for (const entry of entries) {
      if (!state.known.has(entry.signature)) {
        await pushEntryIsolated(entry)
        continue
      }
      // Ligne déjà en base mais incomplète : c'est celle de l'indexer, insérée
      // ~2 s après la tx là où la sync passe ~9 s après. Elle n'a ni photos ni
      // position précise — on la complète, à condition d'avoir mieux à offrir.
      const hasAssets = Boolean(entry.placeId || entry.photoUri || entry.thumbUri)
      if (!state.complete.has(entry.signature) && hasAssets) {
        await pushEntryIsolated(entry)
      }
    }
  } finally {
    syncing = false
  }
}

/**
 * Une entrée refusée (preuve on-chain pas encore visible du RPC, réseau) ne
 * doit pas bloquer les suivantes : elle sera retentée à la prochaine sync.
 */
async function pushEntryIsolated(entry: MintLogEntry): Promise<void> {
  try {
    await pushEntry(entry)
  } catch (error) {
    console.warn(`Sync de ${entry.signature.slice(0, 8)} reportée`, error)
  }
}

async function pushEntry(entry: MintLogEntry): Promise<void> {
  const backend = getBackend()
  // Sans minter : entrée d'avant le champ (juillet), déjà en base. Le serveur
  // exige de toute façon que le minter soit le payeur de la tx (preuve
  // on-chain), et on ne code plus d'adresse de wallet en dur.
  if (!backend || !entry.minter) {
    return
  }
  // Avec un placeId, la photo et le JSON sont déjà déposés depuis l'upload
  // pré-mint (place-metadata.ts) : on ne pousse que la miniature.
  const photoPath = entry.placeId
    ? `${entry.placeId}.jpg`
    : await uploadIfPresent(`${entry.signature}.jpg`, entry.photoUri, 'image/jpeg')
  const thumbPath = await uploadIfPresent(`${entry.placeId ?? entry.signature}.thumb.png`, entry.thumbUri, 'image/png')
  await backend.saveMint({
    signature: entry.signature,
    minter: entry.minter,
    latitude: entry.latitude,
    longitude: entry.longitude,
    photoPath,
    thumbPath,
    metadataPath: entry.placeId ? `${entry.placeId}.json` : null,
    cluster: clusterFromEndpoint(entry.endpoint),
    rpcEndpoint: entry.endpoint,
    mintedAt: entry.mintedAt,
  })
}

async function uploadIfPresent(path: string, uri: string | undefined, contentType: string): Promise<string | null> {
  const backend = getBackend()
  if (!backend || !uri) {
    return null
  }
  const file = new File(uri)
  if (!file.exists) {
    // Photo perdue (mint d'avant la persistance, fichier nettoyé…) : la ligne
    // comptable part quand même, sans preuve photo.
    return null
  }
  const bytes = await file.bytes()
  // La photo est une preuve, jamais réécrite : un doublon signifie qu'une sync
  // précédente l'a déjà déposée.
  await backend.uploadAsset({ path, bytes, contentType, ifExists: 'skip' })
  return path
}
