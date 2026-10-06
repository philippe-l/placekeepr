import { Buffer } from 'buffer'
import { PublicKey, SystemProgram, TransactionInstruction } from '@solana/web3.js'
import { keeperStatsPda } from '@/components/keeper/keeper-stats'

/**
 * Instruction visit_place du programme place_registry : un PDA
 * ["visit", lieu, visiteur] créé au premier passage (le rent n'est payé
 * qu'une fois) puis incrémenté, sous cooldown de 24 h on-chain.
 *
 * Construite à la main comme register-place.ts / like-place.ts. Contrairement
 * au like, la visite exige la **co-signature du vérifieur** : c'est une
 * présence physique, pas un geste à distance.
 */

// sha256("global:visit_place")[0..8] — discriminator Anchor de l'instruction.
const DISCRIMINATOR = Uint8Array.from([52, 252, 206, 187, 105, 253, 222, 129])

const VISIT_SEED = 'visit'
const CONFIG_SEED = 'config'

/** Cooldown on-chain (VISIT_COOLDOWN_SECONDS) : revenir demain, pas farmer. */
export const VISIT_COOLDOWN_MS = 86_400 * 1000

export function visitPda(place: PublicKey, visitor: PublicKey, programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from(VISIT_SEED), place.toBuffer(), visitor.toBuffer()], programId)[0]
}

export interface VisitAccount {
  count: number
  /** Horodatage du dernier passage (ms) — base du cooldown. */
  lastVisitedAt: number
}

/**
 * Layout : discriminator (8), visitor (32), place (32), count (u64 LE, 72..80),
 * last_visited_at (i64 LE, 80..88), bump.
 */
export function parseVisit(data: Uint8Array): VisitAccount {
  const buffer = Buffer.from(data)
  return {
    count: Number(buffer.readBigUInt64LE(72)),
    lastVisitedAt: Number(buffer.readBigInt64LE(80)) * 1000,
  }
}

export function visitPlaceInstruction(
  visitor: PublicKey,
  place: PublicKey,
  keeper: PublicKey,
  verifier: PublicKey,
  programId: PublicKey,
): TransactionInstruction {
  const configPda = PublicKey.findProgramAddressSync([Buffer.from(CONFIG_SEED)], programId)[0]
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: visitor, isSigner: true, isWritable: true },
      { pubkey: place, isSigner: false, isWritable: false },
      { pubkey: configPda, isSigner: false, isWritable: false },
      // Signature apportée hors wallet : la route /verify-visit co-signe le
      // message après l'avoir inspecté (use-place-visit.tsx).
      { pubkey: verifier, isSigner: true, isWritable: false },
      { pubkey: visitPda(place, visitor, programId), isSigner: false, isWritable: true },
      { pubkey: keeperStatsPda(keeper, programId), isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(DISCRIMINATOR),
  })
}
