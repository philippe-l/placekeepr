import { PublicKey } from '@solana/web3.js'
import { useQuery } from '@tanstack/react-query'
import { cellE4, placePda } from '@/components/mint/register-place'
import { AppConfig } from '@/constants/app-config'
import { getBackend } from '@/utils/backend'

/**
 * Passages vérifiés sur un lieu, tous visiteurs confondus (miroir de
 * l'indexer). Pendant de `usePlaceLikeCount` : la carte reçoit le compteur
 * avec la requête de proximité, la fiche plein écran le lit en direct.
 */
export function usePlaceVisitCount(latitude: number, longitude: number) {
  const backend = getBackend()
  const programId = AppConfig.placeRegistryProgram ? new PublicKey(AppConfig.placeRegistryProgram) : null
  const pda = programId ? placePda(cellE4(latitude), cellE4(longitude), programId).toBase58() : null

  return useQuery({
    queryKey: ['place-visit-count', pda],
    enabled: backend !== null && pda !== null,
    staleTime: 30_000,
    queryFn: (): Promise<number> => backend!.placeVisitCount(pda!),
  })
}
