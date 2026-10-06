import { PublicKey, TransactionMessage, VersionedTransaction } from '@solana/web3.js'
import { Base64 } from 'js-base64'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMobileWallet } from '@wallet-ui/react-native-web3js'
import { cellE4, placePda } from '@/components/mint/register-place'
import { PlaceRef } from '@/components/map/use-place-like'
import { VISIT_COOLDOWN_MS, parseVisit, visitPda, visitPlaceInstruction } from '@/components/place/visit-place'
import { getVerifiedPosition, verifyVisitServer } from '@/components/place/verify-visit'
import { AppConfig } from '@/constants/app-config'
import { toPublicKey } from '@/utils/to-public-key'

export interface PlaceVisitState {
  /** Passages déjà effectués par le wallet connecté sur ce lieu. */
  count: number
  /** Fin du cooldown 24 h (ms), ou null si aucun passage encore. */
  cooldownUntil: number | null
}

const EMPTY: PlaceVisitState = { count: 0, cooldownUntil: null }

/**
 * Visite d'un lieu : présence physique co-signée par le vérifieur.
 *
 * L'état vient du PDA Visit lu on-chain (pas du miroir) : c'est lui qui porte
 * le cooldown que le programme fera respecter, et le miroir accuse une à deux
 * secondes de retard d'indexation.
 *
 * Le gardien est passé en argument plutôt que relu ici : la fiche lieu l'a
 * déjà obtenu du compte Place via `usePlaceLike`, et il faut son PDA
 * KeeperStats dans l'instruction.
 */
export function usePlaceVisit(place: PlaceRef, keeper: PublicKey | null) {
  const { account, connection, signAndSendTransactions } = useMobileWallet()
  const queryClient = useQueryClient()

  const programId = AppConfig.placeRegistryProgram ? new PublicKey(AppConfig.placeRegistryProgram) : null
  const wallet = account ? toPublicKey(account.publicKey) : null
  const placeAddress = programId ? placePda(cellE4(place.latitude), cellE4(place.longitude), programId) : null

  const queryKey = ['place-visit', place.signature, wallet?.toBase58() ?? null, connection.rpcEndpoint]

  const query = useQuery({
    queryKey,
    enabled: placeAddress !== null && wallet !== null,
    staleTime: 30_000,
    queryFn: async (): Promise<PlaceVisitState> => {
      const info = await connection.getAccountInfo(visitPda(placeAddress!, wallet!, programId!))
      if (!info) {
        return EMPTY
      }
      const visit = parseVisit(info.data)
      return { count: visit.count, cooldownUntil: visit.lastVisitedAt + VISIT_COOLDOWN_MS }
    },
  })

  const visit = useMutation({
    mutationKey: ['visit-place', place.signature],
    mutationFn: async () => {
      if (!wallet || !programId || !placeAddress || !keeper) {
        throw new Error('Visite indisponible : wallet ou lieu manquant')
      }
      if (!AppConfig.placeVerifier) {
        throw new Error('EXPO_PUBLIC_PLACE_VERIFIER manquant — requis pour la co-signature des visites')
      }
      const verifier = new PublicKey(AppConfig.placeVerifier)

      // Position fraîche au déclenchement, pas celle de l'écran : c'est elle
      // qui sera comparée à la cellule côté serveur.
      const position = await getVerifiedPosition()

      const instruction = visitPlaceInstruction(wallet, placeAddress, keeper, verifier, programId)
      const {
        context: { slot: minContextSlot },
        value: latestBlockhash,
      } = await connection.getLatestBlockhashAndContext()
      // v0 : c'est la seule version que le vérifieur sait inspecter en entier
      // (une address lookup table lui cacherait des comptes).
      const message = new TransactionMessage({
        payerKey: wallet,
        recentBlockhash: latestBlockhash.blockhash,
        instructions: [instruction],
      }).compileToV0Message()
      const transaction = new VersionedTransaction(message)

      // Jette VisitRejected si la présence est refusée (trop loin, fix
      // imprécis, déplacement implausible).
      const signature = await verifyVisitServer({
        visitor: wallet.toBase58(),
        latE4: cellE4(place.latitude),
        lngE4: cellE4(place.longitude),
        latitude: position.latitude,
        longitude: position.longitude,
        accuracy: position.accuracy,
        message: Base64.fromUint8Array(transaction.message.serialize()),
      })
      transaction.addSignature(verifier, Base64.toUint8Array(signature))

      const sent = await signAndSendTransactions(transaction, minContextSlot)
      await connection.confirmTransaction({ signature: sent, ...latestBlockhash }, 'confirmed')
      return sent
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey })
      // Réputation du gardien (on-chain) et compteurs du miroir.
      queryClient.invalidateQueries({ queryKey: ['place-like'] })
      queryClient.invalidateQueries({ queryKey: ['place-visit-count'] })
      queryClient.invalidateQueries({ queryKey: ['nearby-places'] })
      queryClient.invalidateQueries({ queryKey: ['my-activity'] })
    },
  })

  const cooldownUntil = query.data?.cooldownUntil ?? null
  return {
    ...query,
    wallet,
    /** Le cooldown 24 h court encore : le programme refuserait la transaction. */
    onCooldown: cooldownUntil !== null && cooldownUntil > Date.now(),
    cooldownUntil,
    visit,
  }
}
