import AsyncStorage from '@react-native-async-storage/async-storage'

/**
 * Journal local des mints, en attendant le backend Supabase (Phase 3).
 * Contrainte CLAUDE.md : toute interaction on-chain à revenu potentiel doit
 * être logguée pour la comptabilité — ce journal devra être migré, pas jeté.
 */
const STORAGE_KEY = 'placekeepr:mint-log'
// Signatures retirées volontairement du journal (forget-place.ts) : la
// restauration depuis le backend ne doit pas les faire revenir.
const FORGOTTEN_KEY = 'placekeepr:mint-log-forgotten'

export interface MintLogEntry {
  signature: string
  latitude: number
  longitude: number
  photoUri?: string
  // Miniature pixel-art pour l'affichage in-app (pixelate-place-photo.ts).
  // Absente sur les mints antérieurs à la feature : fallback sur photoUri.
  thumbUri?: string
  endpoint: string
  mintedAt: string
  // Pubkey base58 du wallet mineur. Absente sur les entrées antérieures à la
  // sync Supabase : backfillée avec le wallet Seed Vault (sync-mint-log.ts).
  minter?: string
  // Clé de nommage des assets uploadés avant le mint (<placeId>.jpg / .json,
  // place-metadata.ts). Absente = mint à URI placeholder, assets nommés par
  // signature à la sync.
  placeId?: string
}

export async function readMintLog(): Promise<MintLogEntry[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY)
  if (!raw) {
    return []
  }
  try {
    return JSON.parse(raw) as MintLogEntry[]
  } catch {
    return []
  }
}

export async function appendMintLog(entry: MintLogEntry): Promise<void> {
  const entries = await readMintLog()
  entries.push(entry)
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
}

/**
 * Retire une entrée du journal local — le cNFT, lui, reste on-chain.
 * Usage dev/devnet avant le backend ; la contrainte « journal migré, pas
 * jeté » (CLAUDE.md) vise la comptabilité mainnet, pas les essais devnet.
 */
export async function removeMintLog(signature: string): Promise<MintLogEntry | undefined> {
  const entries = await readMintLog()
  const removed = entries.find((entry) => entry.signature === signature)
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(entries.filter((entry) => entry.signature !== signature)))
  const forgotten = await readForgotten()
  forgotten.add(signature)
  await AsyncStorage.setItem(FORGOTTEN_KEY, JSON.stringify([...forgotten]))
  return removed
}

export async function readForgotten(): Promise<Set<string>> {
  try {
    return new Set(JSON.parse((await AsyncStorage.getItem(FORGOTTEN_KEY)) ?? '[]') as string[])
  } catch {
    return new Set()
  }
}

/**
 * Ajoute des entrées absentes du journal (restauration). Relit le journal
 * juste avant d'écrire et dédoublonne par signature : un mint enregistré
 * entre-temps par `appendMintLog` n'est ni perdu ni dupliqué.
 */
export async function mergeMintLog(additions: MintLogEntry[]): Promise<number> {
  const entries = await readMintLog()
  const known = new Set(entries.map((entry) => entry.signature))
  const fresh = additions.filter((entry) => !known.has(entry.signature))
  if (fresh.length > 0) {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([...entries, ...fresh]))
  }
  return fresh.length
}

/**
 * Entrées mintées par ce wallet : le journal est propre au téléphone, pas au
 * wallet — sur un device multi-comptes (Seed Vault), les lieux d'un autre
 * compte doivent s'afficher « autre gardien » (teal, likables), pas « à moi ».
 * Sans minter (entrée d'avant la sync, hors ligne) : réputée au wallet courant.
 */
export function entriesForWallet(entries: MintLogEntry[], wallet: string | null): MintLogEntry[] {
  return entries.filter((entry) => !entry.minter || entry.minter === wallet)
}
