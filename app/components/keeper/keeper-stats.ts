import { Buffer } from 'buffer'
import { PublicKey } from '@solana/web3.js'

/**
 * Compte KeeperStats du programme place_registry : la réputation d'un gardien,
 * agrégée on-chain. Un seul PDA par wallet, créé au premier engagement reçu
 * (like ou visite).
 *
 * Le programme ne stocke que des **compteurs bruts** : la pondération
 * (`reputationScore`, dans ranks.ts) se calcule à l'affichage, pour que
 * changer le barème ne demande aucune migration.
 */

const KEEPER_STATS_SEED = 'keeper'

export interface KeeperStats {
  likesReceived: number
  visitsReceived: number
}

export const EMPTY_KEEPER_STATS: KeeperStats = { likesReceived: 0, visitsReceived: 0 }

export function keeperStatsPda(keeper: PublicKey, programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from(KEEPER_STATS_SEED), keeper.toBuffer()], programId)[0]
}

/**
 * Layout : discriminator (8), keeper (32), likes_received (u64 LE, 40..48),
 * visits_received (u64 LE, 48..56), bump.
 *
 * Les comptes créés avant l'ajout de `visits_received` font 49 octets (la
 * migration devnet du 10/07/2026 les a fermés, mais un compte legacy sur un
 * autre cluster ne doit pas faire planter l'écran) : on lit ce qui est là.
 */
export function parseKeeperStats(data: Uint8Array): KeeperStats {
  const buffer = Buffer.from(data)
  return {
    likesReceived: buffer.length >= 48 ? Number(buffer.readBigUInt64LE(40)) : 0,
    visitsReceived: buffer.length >= 56 ? Number(buffer.readBigUInt64LE(48)) : 0,
  }
}
