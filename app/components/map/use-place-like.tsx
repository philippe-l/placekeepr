import { PublicKey, TransactionMessage, VersionedTransaction } from '@solana/web3.js'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMobileWallet } from '@wallet-ui/react-native-web3js'
import { AppConfig } from '@/constants/app-config'
import { EMPTY_KEEPER_STATS, KeeperStats, keeperStatsPda, parseKeeperStats } from '@/components/keeper/keeper-stats'
import { likePda, likePlaceInstruction, parsePlaceKeeper, unlikePlaceInstruction } from '@/components/map/like-place'
import { NearbyPlace } from '@/components/map/use-nearby-places'
import { cellE4, placePda } from '@/components/mint/register-place'
import { PlaceVault, parsePlaceVault, placeVaultPda } from '@/components/place/place-vault'
import { toPublicKey } from '@/utils/to-public-key'

export interface PlaceLikeState {
  /** Lieu inscrit au registre on-chain — les lieux legacy (pré-registre) ne se likent pas. */
  registered: boolean
  /** Gardien lu depuis le compte Place (source de vérité, pas le minter Supabase). */
  keeper: PublicKey | null
  /** Le wallet connecté a déjà un PDA Like sur ce lieu. */
  liked: boolean
  /** Compteurs bruts du gardien — la pondération est faite à l'affichage. */
  keeperStats: KeeperStats
  /** Cagnotte de royalties du lieu, null tant que personne ne l'a créée
   *  (premier like ou premier dépôt). L'unlike doit le savoir : passer
   *  l'adresse d'un compte inexistant ferait échouer la transaction. */
  vault: PlaceVault | null
}

/** Le minimum pour dériver les PDAs : la fiche plein écran passe par ici aussi. */
export type PlaceRef = Pick<NearbyPlace, 'latitude' | 'longitude' | 'signature'>

/**
 * État like d'un lieu, lu directement on-chain : le PDA Like (wallet, lieu)
 * existe-t-il, et où en est la réputation du gardien. La mutation toggle
 * envoie like_place / unlike_place signée par MWA puis invalide la lecture.
 */
export function usePlaceLike(place: PlaceRef) {
  const { account, connection, signAndSendTransactions } = useMobileWallet()
  const queryClient = useQueryClient()

  const programId = AppConfig.placeRegistryProgram ? new PublicKey(AppConfig.placeRegistryProgram) : null
  const wallet = account ? toPublicKey(account.publicKey) : null
  const cell = { latE4: cellE4(place.latitude), lngE4: cellE4(place.longitude) }
  const placeAddress = programId ? placePda(cell.latE4, cell.lngE4, programId) : null

  const queryKey = ['place-like', place.signature, wallet?.toBase58() ?? null, connection.rpcEndpoint]

  const query = useQuery({
    queryKey,
    enabled: placeAddress !== null,
    staleTime: 30_000,
    queryFn: async (): Promise<PlaceLikeState> => {
      const keys = [placeAddress!, placeVaultPda(placeAddress!, programId!)]
      if (wallet) {
        keys.push(likePda(placeAddress!, wallet, programId!))
      }
      const [placeAccount, vaultAccount, likeAccount] = await connection.getMultipleAccountsInfo(keys)
      if (!placeAccount) {
        return { registered: false, keeper: null, liked: false, keeperStats: EMPTY_KEEPER_STATS, vault: null }
      }
      const keeper = parsePlaceKeeper(placeAccount.data)
      const statsAccount = await connection.getAccountInfo(keeperStatsPda(keeper, programId!))
      return {
        registered: true,
        keeper,
        liked: Boolean(likeAccount),
        keeperStats: statsAccount ? parseKeeperStats(statsAccount.data) : EMPTY_KEEPER_STATS,
        vault: vaultAccount ? parsePlaceVault(vaultAccount.data) : null,
      }
    },
  })

  const toggle = useMutation({
    mutationKey: ['toggle-like', place.signature],
    mutationFn: async () => {
      if (!wallet || !programId || !placeAddress || !query.data?.registered || !query.data.keeper) {
        throw new Error('Like indisponible : wallet ou registre manquant')
      }
      const instruction = query.data.liked
        ? unlikePlaceInstruction(wallet, placeAddress, query.data.keeper, programId, query.data.vault !== null)
        : likePlaceInstruction(wallet, placeAddress, query.data.keeper, programId)

      const {
        context: { slot: minContextSlot },
        value: latestBlockhash,
      } = await connection.getLatestBlockhashAndContext()
      const message = new TransactionMessage({
        payerKey: wallet,
        recentBlockhash: latestBlockhash.blockhash,
        instructions: [instruction],
      }).compileToLegacyMessage()

      const signature = await signAndSendTransactions(new VersionedTransaction(message), minContextSlot)
      await connection.confirmTransaction({ signature, ...latestBlockhash }, 'confirmed')
      return signature
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey })
      // Rafraîchit le compteur de likes (miroir — peut accuser une à deux
      // secondes de retard d'indexation, toléré).
      queryClient.invalidateQueries({ queryKey: ['place-like-count'] })
      queryClient.invalidateQueries({ queryKey: ['nearby-places'] })
    },
  })

  return { ...query, wallet, toggle }
}
