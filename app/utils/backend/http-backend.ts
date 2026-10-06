import {
  ActiveLike,
  AssetUpload,
  Backend,
  KeeperPlace,
  MintRecord,
  MintSyncState,
  MinterMint,
  NearbyPlace,
  PlaceVisit,
  Profile,
  ProfileNameTaken,
  ProfileUpdate,
  VerifyCaptureInput,
  VerifyCaptureResult,
  VerifyVisitInput,
  SkrStatus,
  VerifyVisitResult,
} from '@/utils/backend/types'

/**
 * Implémentation HTTP du contrat `Backend` — parle à l'API PlaceKeepr
 * (`server/`, Hono + Postgres/PostGIS sur le VPS).
 *
 * L'API rend déjà la langue du contrat (camelCase, dates ISO) : ce client est
 * un passe-plat, il ne remappe rien. Les assets sont servis par l'API
 * elle-même sur le même domaine, sous `/assets` — d'où une seule URL de base à
 * configurer.
 */

const TIMEOUT_MS = 15_000

export class HttpBackendError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
  ) {
    super(`Backend HTTP ${status}`)
  }
}

/** `AbortSignal.timeout` n'est pas garanti sous Hermes : minuterie manuelle. */
async function request(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await request(url, init)
  if (!response.ok) {
    throw new HttpBackendError(response.status, await response.text().catch(() => ''))
  }
  return (await response.json()) as T
}

export function createHttpBackend(baseUrl: string, assetBaseUrl?: string): Backend {
  const base = baseUrl.replace(/\/+$/, '')
  const assets = (assetBaseUrl ?? `${base}/assets`).replace(/\/+$/, '')

  return {
    nearbyPlaces(lat, lng, radiusM): Promise<NearbyPlace[]> {
      const query = new URLSearchParams({ lat: String(lat), lng: String(lng), radius_m: String(radiusM) })
      return json<NearbyPlace[]>(`${base}/places/nearby?${query}`)
    },

    placesByKeeper(keeper): Promise<KeeperPlace[]> {
      return json<KeeperPlace[]>(`${base}/places?${new URLSearchParams({ keeper })}`)
    },

    async activeLikes(placePdas, options): Promise<ActiveLike[]> {
      if (placePdas.length === 0) {
        return []
      }
      const query = new URLSearchParams({ places: placePdas.join(',') })
      if (options?.limit !== undefined) {
        query.set('limit', String(options.limit))
      }
      return json<ActiveLike[]>(`${base}/likes?${query}`)
    },

    async activeLikeCount(placePda): Promise<number> {
      const { count } = await json<{ count: number }>(`${base}/likes/count?${new URLSearchParams({ place: placePda })}`)
      return count
    },

    async placeVisits(placePdas, options): Promise<PlaceVisit[]> {
      if (placePdas.length === 0) {
        return []
      }
      const query = new URLSearchParams({ places: placePdas.join(',') })
      if (options?.limit !== undefined) {
        query.set('limit', String(options.limit))
      }
      return json<PlaceVisit[]>(`${base}/visits?${query}`)
    },

    async placeVisitCount(placePda): Promise<number> {
      const { count } = await json<{ count: number }>(
        `${base}/visits/count?${new URLSearchParams({ place: placePda })}`,
      )
      return count
    },

    async mintSyncState(): Promise<MintSyncState> {
      const state = await json<{ known: string[]; complete: string[] }>(`${base}/mints/sync-state`)
      return { known: new Set(state.known), complete: new Set(state.complete) }
    },

    async mintsByMinter(minter: string): Promise<MinterMint[]> {
      return json<MinterMint[]>(`${base}/mints?${new URLSearchParams({ minter })}`)
    },

    async profiles(wallets): Promise<Profile[]> {
      if (wallets.length === 0) {
        return []
      }
      return json<Profile[]>(`${base}/profiles?${new URLSearchParams({ wallets: wallets.join(',') })}`)
    },

    async saveProfile(update: ProfileUpdate): Promise<Profile> {
      const response = await request(`${base}/profiles`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(update),
      })
      if (response.status === 409) {
        // Pseudo pris : une erreur métier, pas une panne. L'app la rattrape
        // pour nommer le problème plutôt que proposer de réessayer.
        throw new ProfileNameTaken()
      }
      if (!response.ok) {
        throw new HttpBackendError(response.status, await response.text().catch(() => ''))
      }
      return (await response.json()) as Profile
    },

    async saveMint(record: MintRecord): Promise<void> {
      // L'API insère ou complète, en une requête : un doublon rend 200, pas 409.
      await json(`${base}/mints`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(record),
      })
    },

    async uploadAsset({ path, bytes, contentType, ifExists = 'error' }: AssetUpload): Promise<string> {
      const response = await request(`${base}/assets/${encodeURIComponent(path)}`, {
        method: 'POST',
        headers: { 'Content-Type': contentType },
        body: bytes as unknown as BodyInit,
      })
      if (response.status === 409) {
        // Chemin déjà pris : une preuve n'est jamais réécrite. Selon l'appelant,
        // c'est un échec (upload pré-mint) ou un non-événement (sync).
        if (ifExists === 'skip') {
          return `${assets}/${path}`
        }
        throw new HttpBackendError(409, await response.text().catch(() => ''))
      }
      if (!response.ok) {
        throw new HttpBackendError(response.status, await response.text().catch(() => ''))
      }
      const { url } = (await response.json()) as { url: string }
      return url
    },

    publicAssetUrl(path): string | undefined {
      return path ? `${assets}/${path}` : undefined
    },

    async verifyCapture(input: VerifyCaptureInput): Promise<VerifyCaptureResult> {
      // Même sémantique que l'edge function : un verdict de refus est un 200
      // avec `ok: false` ; un non-2xx est une vraie erreur qui remonte.
      return json<VerifyCaptureResult>(`${base}/verify-capture`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
    },

    async verifyVisit(input: VerifyVisitInput): Promise<VerifyVisitResult> {
      return json<VerifyVisitResult>(`${base}/verify-visit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
    },

    async skrStatus(wallet: string): Promise<SkrStatus> {
      return json<SkrStatus>(`${base}/skr/${encodeURIComponent(wallet)}`)
    },
  }
}
