import { Profile } from '@/utils/backend'
import { ellipsify } from '@/utils/ellipsify'

/**
 * Ce qu'on affiche pour un wallet : son pseudo s'il en a posé un, son adresse
 * tronquée sinon. Le repli est le comportement normal, pas un cas d'erreur —
 * la grande majorité des wallets n'aura jamais de profil.
 */
export function displayNameOf(wallet: string, profile?: Profile, length = 6): string {
  return profile?.displayName ?? ellipsify(wallet, length)
}
