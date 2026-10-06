import { useQuery } from '@tanstack/react-query'
import { getBackend } from '@/utils/backend'

/**
 * Engagement reçu sur les lieux du wallet connecté : likes actifs et visites
 * vérifiées, du plus récent au plus ancien. La boucle gardien du feed —
 * chaque ligne est une petite récompense visible.
 *
 * Les deux viennent du miroir (l'indexer), pas de la chaîne : c'est le seul
 * endroit qui sache **qui** a aimé ou visité **quoi** sans balayer tous les
 * PDAs du programme.
 */
export interface ReceivedLike {
  liker: string
  likedAt: string
  latE4: number
  lngE4: number
  /** Tx d'inscription du lieu — la clé de navigation vers la fiche. */
  registerSignature: string | null
}

export interface ReceivedVisit {
  visitor: string
  /** Premier passage : le moment où il est devenu un visiteur distinct (#44). */
  firstVisitedAt: string
  /** Dernier passage de ce visiteur sur ce lieu. */
  lastVisitedAt: string
  /** Passages cumulés du couple (lieu, visiteur) — le miroir agrège. */
  visitCount: number
  latE4: number
  lngE4: number
  registerSignature: string | null
}

export interface MyActivity {
  likes: ReceivedLike[]
  visits: ReceivedVisit[]
}

const MAX_ROWS = 50

const EMPTY: MyActivity = { likes: [], visits: [] }

export function useMyActivity(keeper: string | null) {
  const backend = getBackend()

  return useQuery({
    queryKey: ['my-activity', keeper],
    enabled: backend !== null && keeper !== null,
    staleTime: 30_000,
    queryFn: async (): Promise<MyActivity> => {
      const places = await backend!.placesByKeeper(keeper!)
      if (places.length === 0) {
        return EMPTY
      }
      const byPda = new Map(places.map((place) => [place.pda, place]))
      const pdas = places.map((place) => place.pda)
      // Les deux lectures sont indépendantes : en parallèle.
      const [likes, visits] = await Promise.all([
        backend!.activeLikes(pdas, { limit: MAX_ROWS }),
        backend!.placeVisits(pdas, { limit: MAX_ROWS }),
      ])
      return {
        likes: likes.map((like) => {
          const place = byPda.get(like.placePda)!
          return {
            liker: like.liker,
            likedAt: like.likedAt,
            latE4: place.latE4,
            lngE4: place.lngE4,
            registerSignature: place.registerSignature,
          }
        }),
        visits: visits.map((visit) => {
          const place = byPda.get(visit.placePda)!
          return {
            visitor: visit.visitor,
            firstVisitedAt: visit.firstVisitedAt,
            lastVisitedAt: visit.lastVisitedAt,
            visitCount: visit.visitCount,
            latE4: place.latE4,
            lngE4: place.lngE4,
            registerSignature: place.registerSignature,
          }
        }),
      }
    },
  })
}
