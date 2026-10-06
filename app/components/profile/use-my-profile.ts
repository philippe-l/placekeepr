import { PublicKey } from '@solana/web3.js'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMobileWallet } from '@wallet-ui/react-native-web3js'
import { Base64 } from 'js-base64'
import { profileMessageBytes, signatureFromSignedPayload } from '@/components/profile/profile-message'
import { getBackend, Profile } from '@/utils/backend'
import { toPublicKey } from '@/utils/to-public-key'

/**
 * Profil du wallet connecté, en lecture et en écriture.
 *
 * L'écriture passe par une **signature de message** (MWA `signMessages`), pas
 * par une transaction : un pseudo ne coûte ni SOL ni rent, et le serveur n'a
 * besoin que de la preuve que le wallet est bien celui qu'on prétend.
 *
 * Les écrans d'onglet tournent aussi déconnectés (cf. CLAUDE.md, AuthGate) :
 * la requête est donc désactivée sans wallet, jamais en erreur.
 */

function walletOf(account?: { publicKey: PublicKey }): string | null {
  // `toPublicKey` et pas `.toBase58()` direct : au retour du cache, publicKey
  // est déjà une string base58 malgré son type (piège MWA connu).
  return toPublicKey(account?.publicKey)?.toBase58() ?? null
}

export function useMyProfile() {
  const { account } = useMobileWallet()
  const backend = getBackend()
  const wallet = walletOf(account)

  return useQuery({
    queryKey: ['profile', wallet],
    enabled: backend !== null && wallet !== null,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Profile | null> => (await backend!.profiles([wallet!]))[0] ?? null,
  })
}

export interface SaveProfileInput {
  displayName: string | null
  avatarPath: string | null
}

export function useSaveProfile() {
  const { account, signMessages } = useMobileWallet()
  const backend = getBackend()
  const client = useQueryClient()

  return useMutation({
    mutationFn: async ({ displayName, avatarPath }: SaveProfileInput): Promise<Profile> => {
      const wallet = walletOf(account)
      if (!wallet) {
        throw new Error('Wallet non connecté')
      }
      if (!backend) {
        throw new Error('Backend non configuré — renseigner EXPO_PUBLIC_API_URL')
      }

      const claim = { wallet, displayName, avatarPath, issuedAt: new Date().toISOString() }
      const message = profileMessageBytes(claim)
      // `signMessages` rend le *payload signé*, pas la signature : d'où le
      // découpage contrôlé plutôt qu'un `.slice(-64)` optimiste.
      const signed = await signMessages(message)
      const signature = Base64.fromUint8Array(signatureFromSignedPayload(signed, message))

      return backend.saveProfile({ ...claim, signature })
    },
    onError: (error) => {
      // Sans ça l'échec est muet (cf. CLAUDE.md : les erreurs avalées par un
      // `.catch()` restent invisibles). Le statut et le corps sont lus en
      // canard : les remonter typés voudrait dire importer le client HTTP
      // concret ici, ce que le contrat `Backend` interdit.
      const http = error as { status?: number; body?: string }
      console.warn(
        `[profile] enregistrement échoué — ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}` +
          (http?.status ? ` · HTTP ${http.status} ${http.body ?? ''}` : ''),
      )
    },
    onSuccess: (profile) => {
      client.setQueryData(['profile', profile.wallet], profile)
      // Les lots de profils (feed, fiches) portent une clé par ensemble de
      // wallets : on ne peut pas les corriger un par un, on les invalide.
      client.invalidateQueries({ queryKey: ['profiles'] })
    },
  })
}
