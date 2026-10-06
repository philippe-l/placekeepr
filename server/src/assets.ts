import { createHash } from 'node:crypto'
import { mkdir, stat, statfs, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { config } from './config.ts'

/**
 * Stockage des assets sur disque (photos de preuve, miniatures, JSON de
 * métadonnées). Les fichiers sont servis en statique par Caddy, pas par ce
 * serveur : ici on ne fait qu'écrire, et jamais réécrire — une preuve n'est
 * pas modifiable.
 *
 * Ce que la RLS permissive de Supabase ne faisait pas et qu'on fait ici :
 * nom validé, extension et content-type sur liste blanche, taille plafonnée.
 */

const EXTENSIONS: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.json': 'application/json',
}

// `<uuid>.jpg`, `<uuid>.json`, `<signature>.thumb.png` — rien d'autre.
// Le point est autorisé à l'intérieur, jamais en tête, et `..` est exclu par
// construction (pas de segment vide, pas de séparateur de chemin).
const NAME = /^[A-Za-z0-9][A-Za-z0-9_-]*(\.[A-Za-z0-9]+)+$/

export class AssetExists extends Error {
  constructor(name: string) {
    super(`Asset déjà présent : ${name}`)
  }
}

export class AssetRejected extends Error {
  /** 400 : requête malformée. 413 : corps trop volumineux. 507 : disque plein. */
  readonly status: 400 | 413 | 507

  // Pas de propriété de paramètre (`public readonly x` dans la signature) :
  // le type stripping de Node la refuse — `tsc` passe, l'exécution non.
  constructor(message: string, status: 400 | 413 | 507 = 400) {
    super(message)
    this.status = status
  }
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot === -1 ? '' : name.slice(dot).toLowerCase()
}

/**
 * Content-type d'un nom d'asset valide, `undefined` sinon. Sert aussi bien à
 * l'écriture qu'à la lecture : un nom refusé ici ne peut ni être écrit, ni être
 * relu, donc aucune traversée de chemin ne passe.
 */
export function assetContentType(name: string): string | undefined {
  if (!NAME.test(name) || name.includes('/') || name.includes('\\')) {
    return undefined
  }
  return EXTENSIONS[extensionOf(name)]
}

/** Valide le nom et le content-type annoncé. Jette `AssetRejected`. */
export function checkAssetName(name: string, contentType: string): void {
  const expected = assetContentType(name)
  if (!NAME.test(name) || name.includes('/') || name.includes('\\')) {
    throw new AssetRejected('nom invalide')
  }
  if (!expected) {
    throw new AssetRejected('extension non autorisée')
  }
  // Le client peut annoter le charset : on ne compare que le type de base.
  if (contentType.split(';')[0]?.trim().toLowerCase() !== expected) {
    throw new AssetRejected('content-type incohérent avec l’extension')
  }
}

// Photos et avatars : `<sha256 tronqué à 32 hex>.<ext>`, le nom EST le contenu.
const HASH_STEM = /^[0-9a-f]{32}$/
// Fichiers rattachés à une photo (JSON Metaplex, miniature) : même stem que la
// photo, qui doit déjà être déposée. Les UUID sont l'ancien nommage aléatoire
// (avant le 10/09/2026), tolérés ici seulement : leurs photos existent déjà.
const ATTACHED_STEM = /^([0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/
const MAX_METADATA_BYTES = 16 * 1024

/**
 * Le nom correspond-il au contenu ? L'upload est anonyme : sans ce contrôle,
 * n'importe qui écrit n'importe quel nom. Ça ne freine pas le spam (le rate
 * limit nginx et la garde disque s'en chargent), mais ça ferme l'écriture de
 * noms arbitraires et rattache chaque JSON / miniature à une vraie photo.
 * Jette `AssetRejected`.
 */
async function checkAssetContent(name: string, bytes: Uint8Array): Promise<void> {
  const dot = name.indexOf('.')
  const stem = name.slice(0, dot)
  const suffix = name.slice(dot).toLowerCase()

  if (suffix === '.jpg' || suffix === '.png') {
    const digest = createHash('sha256').update(bytes).digest('hex').slice(0, 32)
    if (!HASH_STEM.test(stem) || stem !== digest) {
      throw new AssetRejected('nom ≠ sha256 du contenu')
    }
    return
  }
  if (suffix === '.json' || suffix === '.thumb.png') {
    if (!ATTACHED_STEM.test(stem)) {
      throw new AssetRejected('nom invalide')
    }
    if (suffix === '.json') {
      if (bytes.byteLength > MAX_METADATA_BYTES) {
        throw new AssetRejected(`métadonnées > ${MAX_METADATA_BYTES} octets`, 413)
      }
      try {
        JSON.parse(Buffer.from(bytes).toString('utf8'))
      } catch {
        throw new AssetRejected('JSON invalide')
      }
    }
    if (!(await assetExists(`${stem}.jpg`))) {
      throw new AssetRejected('photo associée absente')
    }
    return
  }
  throw new AssetRejected('nom invalide')
}

/**
 * Refuse d'écrire sous `minFreeDiskBytes` d'espace libre. Le disque est celui
 * de BaladeZen (même VPS, pas de volume dédié) : mieux vaut que PlaceKeepr
 * refuse ses uploads que de faire tomber le voisin.
 */
async function checkFreeSpace(): Promise<void> {
  const fs = await statfs(config.assetsDir)
  if (fs.bavail * fs.bsize < config.minFreeDiskBytes) {
    console.error(`[assets] espace libre < ${config.minFreeDiskBytes} octets : upload refusé`)
    throw new AssetRejected('espace disque insuffisant', 507)
  }
}

/**
 * Écrit l'asset. Jette `AssetExists` si le chemin est déjà pris, et
 * `AssetRejected` si le contenu ne correspond pas au nom ou si le disque est
 * trop plein.
 */
export async function writeAsset(name: string, bytes: Uint8Array): Promise<string> {
  if (bytes.byteLength === 0) {
    throw new AssetRejected('corps vide')
  }
  if (bytes.byteLength > config.maxAssetBytes) {
    throw new AssetRejected(`taille > ${config.maxAssetBytes} octets`, 413)
  }
  await mkdir(config.assetsDir, { recursive: true })
  // Existence AVANT le contrôle du contenu : la sync de l'app renvoie des
  // fichiers déjà déposés et attend un 409 (`ifExists: 'skip'`). Un 400 à la
  // place interromprait toute la boucle `syncMintLog`.
  if (await assetExists(name)) {
    throw new AssetExists(name)
  }
  await checkAssetContent(name, bytes)
  await checkFreeSpace()
  try {
    // `wx` : création exclusive — jamais d'écrasement d'une preuve.
    await writeFile(join(config.assetsDir, name), bytes, { flag: 'wx' })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new AssetExists(name)
    }
    throw error
  }
  return publicAssetUrl(name)
}

export function publicAssetUrl(name: string): string {
  return `${config.publicAssetBaseUrl}/${name}`
}

/**
 * L'asset existe-t-il sur disque ? Passe par la même validation de nom que
 * l'écriture : un nom refusé ne peut pas être sondé, donc aucune traversée de
 * chemin. Sert à refuser un profil qui pointerait sur un avatar jamais déposé.
 */
export async function assetExists(name: string): Promise<boolean> {
  if (!assetContentType(name)) {
    return false
  }
  try {
    await stat(join(config.assetsDir, name))
    return true
  } catch {
    return false
  }
}
