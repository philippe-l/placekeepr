import { PublicKey } from '@solana/web3.js'
import { useQuery } from '@tanstack/react-query'
import { cellE4, placePda } from '@/components/mint/register-place'
import { AppConfig } from '@/constants/app-config'
import { getBackend } from '@/utils/backend'

/**
 * Visiteurs distincts d'un lieu (#44), pour la fiche plein écran — la carte
 * les reçoit avec la requête de proximité. `placeVisits` rend une ligne par
 * couple (lieu, visiteur) : leur nombre EST le nombre de visiteurs distincts,
 * sans route de plus.
 *
 * Clé sous `['place-visit-count', pda]` : l'invalidation qui suit une visite
 * (`use-place-visit.tsx`) la rafraîchit avec le compteur de passages.
 */
export function usePlaceDistinctVisitors(latitude: number, longitude: number) {
  const backend = getBackend()
  const programId = AppConfig.placeRegistryProgram ? new PublicKey(AppConfig.placeRegistryProgram) : null
  const pda = programId ? placePda(cellE4(latitude), cellE4(longitude), programId).toBase58() : null

  return useQuery({
    queryKey: ['place-visit-count', pda, 'distinct'],
    enabled: backend !== null && pda !== null,
    staleTime: 30_000,
    queryFn: async (): Promise<number> => (await backend!.placeVisits([pda!])).length,
  })
}
