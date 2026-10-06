import { Keypair, PublicKey, VersionedMessage } from '@solana/web3.js'
import nacl from 'tweetnacl'
import { config } from './config.ts'

/**
 * Socle commun des deux routes co-signantes (`/verify-capture`,
 * `/verify-visit`). Le programme place_registry exige la signature du
 * vérifieur sur `register_place` **et** sur `visit_place` : c'est elle qui rend
 * la vérification GPS incontournable, même en appelant le programme en direct.
 *
 * ⚠️ Ce que signe le vérifieur, c'est le **message entier**, pas une
 * instruction. Toute instruction du message qui exige sa signature est donc
 * autorisée du même coup. D'où la règle `soleProgramInstruction` : on refuse
 * tout message contenant plus d'une instruction place_registry. Sans elle, il
 * suffisait de joindre un second `register_place` (cellule arbitraire) à une
 * capture légitime pour le faire co-signer au passage — une vérification GPS
 * payait deux inscriptions.
 *
 * Depuis que le vérifieur est aussi **délégué de l'arbre Bubblegum** (#40),
 * sa signature autorise en plus `mintV2` et `updateMetadataV2` sur tout
 * l'arbre (sans collection, le délégué est l'autorité de mise à jour). La
 * règle se généralise donc : `verifierOnlyIn` — la clé du vérifieur ne
 * figure dans AUCUNE instruction du message hors celles que la route a
 * inspectées. Transfert système depuis le vérifieur, réécriture de
 * métadonnées, second mint : tout ce qui n'a pas été vérifié est refusé.
 */

export function loadVerifier(): Keypair | null {
  if (!config.verifierKeypair) {
    return null
  }
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(config.verifierKeypair)))
}

/** Message de transaction v0 désérialisé, ou null si illisible. */
export function parseMessage(base64: string): { bytes: Uint8Array; message: VersionedMessage } | null {
  try {
    const bytes = new Uint8Array(Buffer.from(base64, 'base64'))
    const message = VersionedMessage.deserialize(bytes)
    // Les messages legacy n'exposent pas les mêmes garanties de lookup tables :
    // l'app compile en v0 (capture) ou en legacy (like) — ici on n'accepte que
    // ce qu'on sait inspecter entièrement.
    return message.version === 0 ? { bytes, message } : null
  } catch {
    return null
  }
}

export interface ProgramInstruction {
  /** Position de l'instruction dans le message (cf. `verifierOnlyIn`). */
  index: number
  data: Uint8Array
  /** Clés des comptes de l'instruction, dans l'ordre déclaré. */
  accounts: PublicKey[]
  /** Index de chaque compte dans le message — pour tester le rôle signataire. */
  accountIndexes: number[]
}

/**
 * L'unique instruction du programme présente dans le message, ou null s'il y
 * en a zéro ou plusieurs. Le pluriel est un refus délibéré (cf. en-tête).
 */
export function soleProgramInstruction(message: VersionedMessage, programId: string): ProgramInstruction | null {
  const keys = message.staticAccountKeys
  const matching = message.compiledInstructions
    .map((ix, index) => ({ ix, index }))
    .filter(({ ix }) => keys[ix.programIdIndex]?.toBase58() === programId)
  if (matching.length !== 1) {
    return null
  }
  const { ix, index: position } = matching[0]!
  const accounts: PublicKey[] = []
  for (const index of ix.accountKeyIndexes) {
    const key = keys[index]
    if (!key) {
      // Compte servi par une address lookup table : on ne peut pas le vérifier
      // sans résoudre la table. Refus plutôt que confiance.
      return null
    }
    accounts.push(key)
  }
  return { index: position, data: new Uint8Array(ix.data), accounts, accountIndexes: [...ix.accountKeyIndexes] }
}

/**
 * La clé du vérifieur n'apparaît-elle que dans les instructions inspectées ?
 * Une signature ne peut venir que d'une clé statique : il suffit donc de
 * chercher son index parmi les comptes (et programmes) des autres
 * instructions. Absent des clés statiques = rien à autoriser.
 */
export function verifierOnlyIn(
  message: VersionedMessage,
  inspected: ProgramInstruction[],
  verifier: PublicKey,
): boolean {
  const verifierIndex = message.staticAccountKeys.findIndex((key) => key.equals(verifier))
  if (verifierIndex === -1) {
    return true
  }
  const allowed = new Set(inspected.map((ix) => ix.index))
  return message.compiledInstructions.every(
    (ix, index) =>
      allowed.has(index) || (ix.programIdIndex !== verifierIndex && !ix.accountKeyIndexes.includes(verifierIndex)),
  )
}

/** Le compte d'index `position` est-il bien ce vérifieur, et signataire requis ? */
export function verifierIsSigner(
  message: VersionedMessage,
  ix: ProgramInstruction,
  position: number,
  verifier: PublicKey,
): boolean {
  const index = ix.accountIndexes[position]
  return (
    index !== undefined &&
    index < message.header.numRequiredSignatures &&
    ix.accounts[position]?.equals(verifier) === true
  )
}

export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((byte, i) => byte === b[i])
}

export function i32le(value: number): Uint8Array {
  const bytes = new Uint8Array(4)
  new DataView(bytes.buffer).setInt32(0, value, true)
  return bytes
}

export function cellE4(value: number): number {
  return Math.round(value * 10_000)
}

/** PDA ["place", lat_e4, lng_e4] — dérivé, jamais reçu du client. */
export function placePda(latE4: number, lngE4: number): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('place'), Buffer.from(i32le(latE4)), Buffer.from(i32le(lngE4))],
    new PublicKey(config.placeRegistryProgram),
  )[0]
}

/** PDA ["vault", place] — cagnotte de royalties, créateur unique du cNFT. */
export function placeVaultPda(place: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('vault'), place.toBuffer()],
    new PublicKey(config.placeRegistryProgram),
  )[0]
}

export function signMessage(bytes: Uint8Array, verifier: Keypair): string {
  return Buffer.from(nacl.sign.detached(bytes, verifier.secretKey)).toString('base64')
}
