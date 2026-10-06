import * as Location from 'expo-location'
import { useQuery } from '@tanstack/react-query'

/**
 * Position une-fois pour le feed AUTOUR : la dernière connue si dispo (rapide),
 * sinon un fix équilibré. Pas besoin de la précision de capture ici.
 */
export function useCoarsePosition() {
  return useQuery({
    queryKey: ['coarse-position'],
    staleTime: 120_000,
    queryFn: async (): Promise<{ latitude: number; longitude: number } | null> => {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') {
        return null
      }
      const position =
        (await Location.getLastKnownPositionAsync()) ??
        (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }))
      return position ? { latitude: position.coords.latitude, longitude: position.coords.longitude } : null
    },
  })
}
