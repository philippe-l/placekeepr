import { useQuery } from '@tanstack/react-query'
import { getBackend } from '@/utils/backend'

/**
 * Lieux du gardien avec leurs likes actifs, depuis le miroir alimenté par
 * l'indexer Helius. Sert la grille de collection et les badges — l'affichage
 * des miniatures reste le journal local, joint par cellule.
 */
export interface KeeperPlace {
  pda: string
  latE4: number
  lngE4: number
  likeCount: number
  /** Visiteurs distincts (#44) — le statut « confirmé » s'en déduit. */
  distinctVisitors: number
}

export function useKeeperPlaces(keeper: string | null) {
  const backend = getBackend()

  return useQuery({
    queryKey: ['keeper-places', keeper],
    enabled: backend !== null && keeper !== null,
    staleTime: 60_000,
    queryFn: async (): Promise<KeeperPlace[]> => {
      const places = await backend!.placesByKeeper(keeper!)
      if (places.length === 0) {
        return []
      }
      const likes = await backend!.activeLikes(places.map((place) => place.pda))
      const counts = new Map<string, number>()
      for (const like of likes) {
        counts.set(like.placePda, (counts.get(like.placePda) ?? 0) + 1)
      }
      return places.map((place) => ({
        pda: place.pda,
        latE4: place.latE4,
        lngE4: place.lngE4,
        likeCount: counts.get(place.pda) ?? 0,
        distinctVisitors: place.distinctVisitors,
      }))
    },
  })
}
