import { PublicKey } from '@solana/web3.js'
import { useQuery } from '@tanstack/react-query'
import { useMobileWallet } from '@wallet-ui/react-native-web3js'
import { EMPTY_KEEPER_STATS, KeeperStats, keeperStatsPda, parseKeeperStats } from '@/components/keeper/keeper-stats'
import { AppConfig } from '@/constants/app-config'
import { toPublicKey } from '@/utils/to-public-key'

/**
 * Réputation du wallet connecté, lue on-chain (KeeperStats — la source de
 * vérité, le miroir ne sert qu'aux jointures). Compteurs bruts : la
 * pondération est appliquée à l'affichage (`reputationScore`).
 * Tout à zéro si le PDA n'existe pas encore (aucun engagement reçu).
 */
export function useKeeperStats() {
  const { account, connection } = useMobileWallet()
  const wallet = account ? toPublicKey(account.publicKey) : null
  const programId = AppConfig.placeRegistryProgram ? new PublicKey(AppConfig.placeRegistryProgram) : null

  return useQuery({
    queryKey: ['keeper-stats', wallet?.toBase58() ?? null, connection.rpcEndpoint],
    enabled: wallet !== null && programId !== null,
    staleTime: 30_000,
    queryFn: async (): Promise<KeeperStats> => {
      const info = await connection.getAccountInfo(keeperStatsPda(wallet!, programId!))
      return info ? parseKeeperStats(info.data) : EMPTY_KEEPER_STATS
    },
  })
}
