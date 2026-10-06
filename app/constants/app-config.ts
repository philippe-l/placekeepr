import { clusterApiUrl } from '@solana/web3.js'
import { Cluster } from '@/components/cluster/cluster'
import { ClusterNetwork } from '@/components/cluster/cluster-network'

// Le réseau par défaut vient de l'env (EXPO_PUBLIC_SOLANA_NETWORK), jamais en dur.
// Devnet pendant toute la phase d'apprentissage — voir CLAUDE.md.
const defaultNetwork = (process.env.EXPO_PUBLIC_SOLANA_NETWORK ?? ClusterNetwork.Devnet) as ClusterNetwork
const customRpcUrl = process.env.EXPO_PUBLIC_SOLANA_RPC_URL

const knownClusters: Cluster[] = [
  {
    id: 'solana:devnet',
    name: 'Devnet',
    endpoint: clusterApiUrl('devnet'),
    network: ClusterNetwork.Devnet,
  },
  {
    id: 'solana:testnet',
    name: 'Testnet',
    endpoint: clusterApiUrl('testnet'),
    network: ClusterNetwork.Testnet,
  },
  {
    id: 'solana:mainnet',
    name: 'Mainnet',
    endpoint: clusterApiUrl('mainnet-beta'),
    network: ClusterNetwork.Mainnet,
  },
]

// Le cluster par défaut (clusters[0]) est celui de l'env, avec RPC custom éventuel
// (ex: endpoint Helius). Mainnet n'est proposé que s'il est explicitement demandé.
const clusters: Cluster[] = knownClusters
  .filter((cluster) => cluster.network === defaultNetwork || cluster.network !== ClusterNetwork.Mainnet)
  .sort((a, b) => (a.network === defaultNetwork ? -1 : b.network === defaultNetwork ? 1 : 0))
  .map((cluster) =>
    cluster.network === defaultNetwork && customRpcUrl ? { ...cluster, endpoint: customRpcUrl } : cluster,
  )

export class AppConfig {
  static name = 'PlaceKeepr'
  static uri = 'https://placekeepr.app'
  // Adresse de l'arbre de Merkle Bubblegum (créé via scripts/create-tree.ts)
  static merkleTree = process.env.EXPO_PUBLIC_MERKLE_TREE ?? ''
  // Programme place_registry (program/) — unicité on-chain des lieux.
  // Absent = mint sans registre (mode dégradé, pas de garantie d'unicité).
  static placeRegistryProgram = process.env.EXPO_PUBLIC_PLACE_REGISTRY_PROGRAM ?? ''
  // Pubkey du vérifieur GPS (keypair détenu par l'edge function verify-capture),
  // co-signataire obligatoire de chaque register_place. Requis avec le registre.
  static placeVerifier = process.env.EXPO_PUBLIC_PLACE_VERIFIER ?? ''
  // API PlaceKeepr (server/, VPS). Absente = mode local pur, la sync est inactive.
  static apiUrl = process.env.EXPO_PUBLIC_API_URL ?? ''
  static clusters = clusters
}
