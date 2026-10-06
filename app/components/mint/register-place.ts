import { Buffer } from 'buffer'
import { PublicKey, SystemProgram, TransactionInstruction } from '@solana/web3.js'
import { AppConfig } from '@/constants/app-config'

/**
 * Instruction register_place du programme place_registry (program/) : init du
 * PDA ["place", lat_e4, lng_e4] — cellule déjà prise = échec de toute la tx,
 * donc du mintV2 qui l'accompagne. Construite à la main (discriminator Anchor
 * + args en LE) : pas besoin d'embarquer le client Anchor pour une instruction.
 */

// sha256("global:register_place")[0..8] — discriminator Anchor de l'instruction.
const DISCRIMINATOR = Uint8Array.from([193, 120, 229, 116, 127, 194, 89, 143])

const PLACE_SEED = 'place'
const CONFIG_SEED = 'config'

// Cellule de la grille d'unicité : 4 décimales ≈ 11 m (la grille de placeSlug,
// mais dérivée par Math.round — seule référence pour le on-chain).
export function cellE4(value: number): number {
  return Math.round(value * 10_000)
}

function i32le(value: number): Buffer {
  const buf = Buffer.alloc(4)
  buf.writeInt32LE(value, 0)
  return buf
}

export function placePda(latE4: number, lngE4: number, programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from(PLACE_SEED), i32le(latE4), i32le(lngE4)], programId)[0]
}

/** Null si le programme n'est pas configuré : mint sans registre, mode dégradé. */
export function registerPlaceInstruction(
  keeper: PublicKey,
  latitude: number,
  longitude: number,
): TransactionInstruction | null {
  if (!AppConfig.placeRegistryProgram) {
    return null
  }
  if (!AppConfig.placeVerifier) {
    throw new Error('EXPO_PUBLIC_PLACE_VERIFIER manquant — requis avec le registre (co-signature)')
  }
  const programId = new PublicKey(AppConfig.placeRegistryProgram)
  const configPda = PublicKey.findProgramAddressSync([Buffer.from(CONFIG_SEED)], programId)[0]
  const latE4 = cellE4(latitude)
  const lngE4 = cellE4(longitude)
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: keeper, isSigner: true, isWritable: true },
      { pubkey: placePda(latE4, lngE4, programId), isSigner: false, isWritable: true },
      { pubkey: configPda, isSigner: false, isWritable: false },
      // Signature apportée hors wallet : l'edge function verify-capture co-signe
      // le message après inspection (use-mint-place.tsx).
      { pubkey: new PublicKey(AppConfig.placeVerifier), isSigner: true, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([Buffer.from(DISCRIMINATOR), i32le(latE4), i32le(lngE4)]),
  })
}
