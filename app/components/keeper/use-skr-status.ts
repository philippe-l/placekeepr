import { useQuery } from '@tanstack/react-query'
import { getBackend } from '@/utils/backend'
import type { SkrStatus } from '@/utils/backend/types'

/**
 * Statut SKR d'un wallet (stake mainnet lu par le serveur). Un stake ne bouge
 * qu'avec 48 h de délai : une lecture toutes les 10 min suffit largement.
 */
export function useSkrStatus(wallet: string | null) {
  const backend = getBackend()

  return useQuery({
    queryKey: ['skr-status', wallet],
    enabled: backend !== null && wallet !== null,
    staleTime: 10 * 60 * 1000,
    queryFn: (): Promise<SkrStatus> => backend!.skrStatus(wallet!),
  })
}
