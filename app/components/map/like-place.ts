import { Buffer } from 'buffer'
import { PublicKey, SystemProgram, TransactionInstruction } from '@solana/web3.js'
import { keeperStatsPda } from '@/components/keeper/keeper-stats'
import { placeVaultPda } from '@/components/place/place-vault'

/**
 * Instructions like_place / unlike_place du programme place_registry :
 * un PDA ["like", place, likeur] daté par like (unicité par init, close +
 * remboursement du rent à l'unlike), qui alimente le PDA ["keeper", gardien]
 * de la réputation (`keeper-stats.ts`, partagé avec les visites). Construites
 * à la main comme register-place.ts — pas de co-signature vérifieur : liker à
 * distance est voulu.
 *
 * Depuis la Phase 4, les deux instructions touchent aussi la cagnotte du lieu
 * (`place-vault.ts`) : liker entre dans le ring buffer des « likers récents »
 * du split royalties, unliker en sort. Le like crée la cagnotte si elle
 * n'existe pas ; l'unlike la prend en compte optionnel, les lieux likés avant
 * la Phase 4 n'en ayant pas — un compte optionnel absent se passe en Anchor
 * par l'adresse du programme lui-même.
 */

// sha256("global:like_place")[0..8] / sha256("global:unlike_place")[0..8].
const LIKE_DISCRIMINATOR = Uint8Array.from([123, 180, 28, 220, 62, 162, 150, 142])
const UNLIKE_DISCRIMINATOR = Uint8Array.from([227, 235, 21, 227, 78, 43, 45, 164])

const LIKE_SEED = 'like'

export function likePda(place: PublicKey, liker: PublicKey, programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from(LIKE_SEED), place.toBuffer(), liker.toBuffer()], programId)[0]
}

/** Layout du compte Place : discriminator (8) puis keeper (32). */
export function parsePlaceKeeper(data: Uint8Array): PublicKey {
  return new PublicKey(data.subarray(8, 40))
}

export function likePlaceInstruction(
  liker: PublicKey,
  place: PublicKey,
  keeper: PublicKey,
  programId: PublicKey,
): TransactionInstruction {
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: liker, isSigner: true, isWritable: true },
      { pubkey: place, isSigner: false, isWritable: false },
      { pubkey: likePda(place, liker, programId), isSigner: false, isWritable: true },
      { pubkey: keeperStatsPda(keeper, programId), isSigner: false, isWritable: true },
      // Créée au premier like reçu par le lieu, aux frais du likeur.
      { pubkey: placeVaultPda(place, programId), isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(LIKE_DISCRIMINATOR),
  })
}

/**
 * `hasVault` : false pour un lieu liké avant la Phase 4, dont la cagnotte
 * n'existe pas. Passer son adresse quand même ferait échouer l'unlike
 * (compte non initialisé) ; Anchor attend l'adresse du programme pour dire
 * « absent ».
 */
export function unlikePlaceInstruction(
  liker: PublicKey,
  place: PublicKey,
  keeper: PublicKey,
  programId: PublicKey,
  hasVault: boolean,
): TransactionInstruction {
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: liker, isSigner: true, isWritable: true },
      { pubkey: place, isSigner: false, isWritable: false },
      { pubkey: likePda(place, liker, programId), isSigner: false, isWritable: true },
      { pubkey: keeperStatsPda(keeper, programId), isSigner: false, isWritable: true },
      {
        pubkey: hasVault ? placeVaultPda(place, programId) : programId,
        isSigner: false,
        isWritable: hasVault,
      },
    ],
    data: Buffer.from(UNLIKE_DISCRIMINATOR),
  })
}
