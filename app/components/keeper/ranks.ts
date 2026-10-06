import { KeeperStats } from '@/components/keeper/keeper-stats'

/**
 * Échelle de rangs de la réputation gardien (handoff design §5) : le nombre
 * reste le héros (décision 5a), le rang nommé et l'objectif concret évitent
 * le compteur froid. Clés i18n : rank.<key>.
 */

/** Une visite vaut deux likes : elle demande d'y aller. */
export const VISIT_WEIGHT = 2

/**
 * Pondération de la réputation, calculée **à l'affichage** : le programme ne
 * stocke que des compteurs bruts, donc changer ce barème ne demande aucune
 * migration on-chain.
 */
export function reputationScore(stats: KeeperStats): number {
  return stats.likesReceived + VISIT_WEIGHT * stats.visitsReceived
}

export interface Rank {
  key: 'vagabond' | 'eclaireur' | 'gardien' | 'sentinelle' | 'cartographe' | 'legende'
  threshold: number
}

export const RANKS: Rank[] = [
  { key: 'vagabond', threshold: 0 },
  { key: 'eclaireur', threshold: 10 },
  { key: 'gardien', threshold: 50 },
  { key: 'sentinelle', threshold: 150 },
  { key: 'cartographe', threshold: 400 },
  { key: 'legende', threshold: 1000 },
]

export interface RankProgress {
  current: Rank
  /** Null au rang maximal. */
  next: Rank | null
  /** Progression vers le rang suivant, 0..1 (1 au rang maximal). */
  progress: number
  /** Points de réputation restants avant le rang suivant (0 au rang maximal). */
  remaining: number
}

/**
 * Rangs franchis en passant de `before` à `after` points. Une visite vaut 2 :
 * un palier peut donc être **enjambé** sans que la réputation tombe
 * exactement dessus — tester l'égalité laisserait le franchissement invisible.
 */
export function ranksCrossed(before: number, after: number): Rank[] {
  return RANKS.filter((rank) => rank.threshold > before && rank.threshold <= after)
}

export function rankProgress(reputation: number): RankProgress {
  let index = 0
  for (let i = RANKS.length - 1; i >= 0; i--) {
    if (reputation >= RANKS[i].threshold) {
      index = i
      break
    }
  }
  const current = RANKS[index]
  const next = RANKS[index + 1] ?? null
  return {
    current,
    next,
    progress: next ? (reputation - current.threshold) / (next.threshold - current.threshold) : 1,
    remaining: next ? next.threshold - reputation : 0,
  }
}
