/**
 * Configuration du serveur, exclusivement par variables d'environnement
 * (contrainte CLAUDE.md : devnet/mainnet bascule par config, jamais en dur).
 * Les secrets ne sont jamais lus ailleurs qu'ici.
 */

function required(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Variable d'environnement manquante : ${name}`)
  }
  return value
}

export const config = {
  port: Number(process.env.PORT ?? 8787),
  databaseUrl: required('DATABASE_URL'),

  /** Répertoire où sont écrits les assets — servi en statique par Caddy. */
  assetsDir: process.env.ASSETS_DIR ?? '/data/assets',
  /** Base publique des assets, p. ex. https://placekeepr.app/assets */
  publicAssetBaseUrl: required('PUBLIC_ASSET_BASE_URL').replace(/\/+$/, ''),
  maxAssetBytes: Number(process.env.MAX_ASSET_BYTES ?? 8 * 1024 * 1024),
  /** Sous ce seuil d'espace libre, plus aucun upload (disque partagé avec BaladeZen). */
  minFreeDiskBytes: Number(process.env.MIN_FREE_DISK_BYTES ?? 10 * 1024 ** 3),

  placeRegistryProgram: required('PLACE_REGISTRY_PROGRAM'),
  /**
   * Arbre Bubblegum PRIVÉ dont le vérifieur est délégué (#40) : seul arbre
   * dans lequel /verify-capture co-signe un mint. Absent = aucune capture
   * co-signée (503), jamais « n'importe quel arbre ».
   */
  merkleTree: process.env.MERKLE_TREE ?? '',
  /**
   * RPC MAINNET, lecture seule : SKR staké des wallets (src/skr.ts). Jamais
   * utilisé pour signer ni envoyer quoi que ce soit.
   */
  skrRpcUrl: process.env.SKR_RPC_URL ?? 'https://api.mainnet-beta.solana.com',
  /** Cluster attribué aux mints découverts par l'indexer (sans contexte client). */
  cluster: process.env.CLUSTER ?? 'devnet',
  /**
   * RPC du cluster de l'app : `POST /mints` y relit la transaction avant
   * d'écrire (src/mint-proof.ts). Doit pointer sur le même cluster que CLUSTER.
   */
  solanaRpcUrl: process.env.SOLANA_RPC_URL ?? 'https://api.devnet.solana.com',

  /** Keypair du vérifieur GPS : tableau JSON de 64 octets. Jamais commité. */
  verifierKeypair: process.env.VERIFIER_KEYPAIR ?? '',
  /** Secret partagé avec Helius (= authHeader du webhook). Fail-closed. */
  heliusWebhookSecret: process.env.HELIUS_WEBHOOK_SECRET ?? '',
} as const
