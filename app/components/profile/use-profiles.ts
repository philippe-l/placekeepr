import { useQuery } from '@tanstack/react-query'
import { getBackend, Profile } from '@/utils/backend'

/**
 * Profils d'un lot de wallets, indexés par adresse. Une seule requête pour
 * tout un écran : le feed d'activité affiche une vingtaine d'adresses, et une
 * requête par ligne serait absurde.
 *
 * Un wallet sans profil est simplement absent de la table rendue — c'est
 * `displayNameOf` qui décide du repli, pas l'appelant.
 */
export type ProfileMap = Record<string, Profile>

export function useProfiles(wallets: (string | null | undefined)[]) {
  const backend = getBackend()
  // Clé stable : sans le tri, deux rendus qui listent les mêmes wallets dans
  // un ordre différent refetcheraient en boucle.
  const unique = [...new Set(wallets.filter((wallet): wallet is string => !!wallet))].sort()

  return useQuery({
    queryKey: ['profiles', unique],
    enabled: backend !== null && unique.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<ProfileMap> => {
      const rows = await backend!.profiles(unique)
      return Object.fromEntries(rows.map((profile) => [profile.wallet, profile]))
    },
  })
}
