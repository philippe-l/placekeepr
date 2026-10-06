import { useQuery } from '@tanstack/react-query'
import { getBackend, NearbyPlace } from '@/utils/backend'

/**
 * Lieux à proximité depuis le backend (requête géospatiale, du plus proche au
 * plus lointain). Centre arrondi à 3 décimales (~110 m) pour ne pas refetch au
 * moindre jitter GPS. Inactif sans backend configuré ou sans position — la
 * carte retombe alors sur le seul journal local.
 */
const RADIUS_M = 50_000

export type { NearbyPlace }

export function useNearbyPlaces(coords?: { latitude: number; longitude: number }) {
  const backend = getBackend()
  const lat = coords ? Number(coords.latitude.toFixed(3)) : undefined
  const lng = coords ? Number(coords.longitude.toFixed(3)) : undefined

  return useQuery({
    queryKey: ['nearby-places', lat, lng],
    enabled: backend !== null && lat !== undefined && lng !== undefined,
    staleTime: 60_000,
    queryFn: (): Promise<NearbyPlace[]> => backend!.nearbyPlaces(lat!, lng!, RADIUS_M),
  })
}
