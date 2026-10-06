import { Buffer } from 'buffer'
import { PublicKey, SystemProgram, TransactionInstruction } from '@solana/web3.js'

/**
 * Cagnotte de royalties d'un lieu : PDA ["vault", place] du programme
 * place_registry, qui détient les lamports ET le ring buffer des dix derniers
 * likeurs. Instructions construites à la main comme register-place.ts.
 *
 * C'est l'adresse de ce PDA qui part en créateur unique (non vérifié) dans le
 * `creators[]` du cNFT : ce tableau est figé au mint par Bubblegum, il ne peut
 * donc pas porter un split dont la composition change à chaque like. Le
 * partage se fait à la distribution, côté programme.
 */

// Discriminators Anchor — sha256("global:<instruction>")[0..8].
const DEPOSIT_DISCRIMINATOR = Uint8Array.from([234, 6, 85, 217, 36, 30, 33, 127])
const DISTRIBUTE_DISCRIMINATOR = Uint8Array.from([231, 198, 160, 162, 181, 219, 140, 100])

const VAULT_SEED = 'vault'
const TREASURY_SEED = 'treasury'

/** Taille du compte PlaceVault, rent à provisionner comprise. */
export const PLACE_VAULT_SIZE = 8 + 32 + 10 * 32 + 1 + 1 + 8 + 1

const RECENT_LIKERS = 10

export interface PlaceVault {
  place: PublicKey
  /** Likeurs encore actifs, dans l'ordre du ring buffer — l'ordre exact
   *  qu'attend distribute_royalties en remaining_accounts. */
  recentLikers: PublicKey[]
  /** Cumul déjà distribué depuis ce vault (lamports). */
  totalDistributed: bigint
}

export function placeVaultPda(place: PublicKey, programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from(VAULT_SEED), place.toBuffer()], programId)[0]
}

export function treasuryPda(programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from(TREASURY_SEED)], programId)[0]
}

/**
 * Layout PlaceVault : place 8..40, recent_likers 40..360 (10 × 32),
 * recent_len 360, cursor 361, total_distributed u64 LE 362..370, bump 370.
 * Une case à zéro = like retiré, on la saute.
 */
export function parsePlaceVault(data: Uint8Array): PlaceVault {
  const recentLen = Math.min(data[360], RECENT_LIKERS)
  const recentLikers: PublicKey[] = []
  for (let slot = 0; slot < recentLen; slot += 1) {
    const offset = 40 + slot * 32
    const liker = new PublicKey(data.subarray(offset, offset + 32))
    if (!liker.equals(PublicKey.default)) {
      recentLikers.push(liker)
    }
  }
  return {
    place: new PublicKey(data.subarray(8, 40)),
    recentLikers,
    totalDistributed: Buffer.from(data.subarray(362, 370)).readBigUInt64LE(0),
  }
}

/** Layout Treasury : destination 8..40, bump 40. */
export function parseTreasuryDestination(data: Uint8Array): PublicKey {
  return new PublicKey(data.subarray(8, 40))
}

/**
 * Dépôt dans la cagnotte d'un lieu. Sur devnet il n'existe aucune marketplace
 * cNFT : le dépôt remplace la vente secondaire, et laisse une trace décodable
 * par l'indexer là où un transfert système nu serait invisible.
 */
export function depositRoyaltyInstruction(
  payer: PublicKey,
  place: PublicKey,
  lamports: bigint,
  programId: PublicKey,
): TransactionInstruction {
  const amount = Buffer.alloc(8)
  amount.writeBigUInt64LE(lamports, 0)
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: place, isSigner: false, isWritable: false },
      { pubkey: placeVaultPda(place, programId), isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([Buffer.from(DEPOSIT_DISCRIMINATOR), amount]),
  })
}

/**
 * Distribution de la cagnotte : 60 % gardien, 20 % trésorerie, 20 % partagés
 * entre les likeurs récents. Permissionless — le programme dérive tout de la
 * chaîne, l'appelant ne fait qu'avancer les frais. Les likeurs passent en
 * comptes supplémentaires, dans l'ordre exact du ring buffer : le programme
 * refuse toute autre liste.
 */
export function distributeRoyaltiesInstruction(
  place: PublicKey,
  keeper: PublicKey,
  treasuryDestination: PublicKey,
  recentLikers: PublicKey[],
  programId: PublicKey,
): TransactionInstruction {
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: place, isSigner: false, isWritable: false },
      { pubkey: placeVaultPda(place, programId), isSigner: false, isWritable: true },
      { pubkey: keeper, isSigner: false, isWritable: true },
      { pubkey: treasuryPda(programId), isSigner: false, isWritable: false },
      { pubkey: treasuryDestination, isSigner: false, isWritable: true },
      ...recentLikers.map((liker) => ({ pubkey: liker, isSigner: false, isWritable: true })),
    ],
    data: Buffer.from(DISTRIBUTE_DISCRIMINATOR),
  })
}
