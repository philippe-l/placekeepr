import { AppConfig } from '@/constants/app-config'
import { Backend } from '@/utils/backend/types'
import { createHttpBackend } from '@/utils/backend/http-backend'

/**
 * Fabrique du backend, mémoïsée. Rend `null` quand rien n'est configuré :
 * l'app tourne alors en mode local pur (journal AsyncStorage seul), ce qui est
 * aussi le filet de sécurité si le backend est indisponible en démo.
 */
let backend: Backend | null | undefined

export function getBackend(): Backend | null {
  if (backend === undefined) {
    if (AppConfig.apiUrl) {
      backend = createHttpBackend(AppConfig.apiUrl)
    } else {
      backend = null
    }
  }
  return backend
}

/** URL publique d'un asset, ou `undefined` sans backend configuré. */
export function assetUrl(path: string | null | undefined): string | undefined {
  return getBackend()?.publicAssetUrl(path)
}

/** Alias historique d'`assetUrl`, conservé pour les appelants « photo de lieu ». */
export const placePhotoUrl = assetUrl

export * from '@/utils/backend/types'
