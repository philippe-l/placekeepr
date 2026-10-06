import { PublicKey } from '@solana/web3.js'
import { useQuery } from '@tanstack/react-query'
import { cellE4, placePda } from '@/components/mint/register-place'
import { AppConfig } from '@/constants/app-config'
import { getBackend } from '@/utils/backend'

/**
 * Likes actifs d'un lieu, comptés en live dans le miroir (PDA dérivé des
 * coordonnées). Sert la fiche plein écran — la carte, elle, reçoit le compteur
 * via la requête de proximité.
 */
export function usePlaceLikeCount(latitude: number, longitude: number) {
  const backend = getBackend()
  const programId = AppConfig.placeRegistryProgram ? new PublicKey(AppConfig.placeRegistryProgram) : null
  const pda = programId ? placePda(cellE4(latitude), cellE4(longitude), programId).toBase58() : null

  return useQuery({
    queryKey: ['place-like-count', pda],
    enabled: backend !== null && pda !== null,
    staleTime: 30_000,
    queryFn: (): Promise<number> => backend!.activeLikeCount(pda!),
  })
}
