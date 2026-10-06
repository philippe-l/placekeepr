import { PublicKey, TransactionMessage, VersionedTransaction } from '@solana/web3.js'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMobileWallet } from '@wallet-ui/react-native-web3js'
import {
  PLACE_VAULT_SIZE,
  distributeRoyaltiesInstruction,
  parsePlaceVault,
  parseTreasuryDestination,
  placeVaultPda,
  treasuryPda,
} from '@/components/place/place-vault'
import { AppConfig } from '@/constants/app-config'
import { toPublicKey } from '@/utils/to-public-key'

/**
 * Royalties d'un gardien, lues **on-chain** : une cagnotte par lieu
 * (`place-vault.ts`), son solde distribuable et le cumul déjà versé. Pas de
 * miroir ici — l'argent est sur la chaîne, et c'est la seule source qui ne
 * peut pas accuser un retard d'indexation au moment de distribuer.
 *
 * La distribution est permissionless : le gardien la déclenche depuis son
 * écran, mais n'importe qui pourrait le faire, et le programme calcule les
 * parts tout seul.
 */

export interface PlaceRoyalties {
  place: PublicKey
  /** Lamports distribuables = solde au-dessus du plancher de rent du vault. */
  pending: number
  totalDistributed: number
  /** Likeurs récents actifs, dans l'ordre du ring buffer — l'instruction les
   *  exige dans cet ordre exact. */
  recentLikers: PublicKey[]
}

export interface KeeperRoyalties {
  places: PlaceRoyalties[]
  pending: number
  distributed: number
  /** Destinataire de la part trésorerie, lu du PDA ["treasury"]. Null tant
   *  que l'admin ne l'a pas posé : la distribution est alors impossible. */
  treasury: PublicKey | null
}

const EMPTY: KeeperRoyalties = { places: [], pending: 0, distributed: 0, treasury: null }

/** Distributions groupées par transaction : 5 comptes + jusqu'à 10 likeurs
 *  par lieu, au-delà la transaction devient trop grosse. */
const PLACES_PER_TX = 3

export function useKeeperRoyalties(places: string[]) {
  const { account, connection, signAndSendTransactions } = useMobileWallet()
  const queryClient = useQueryClient()

  const programId = AppConfig.placeRegistryProgram ? new PublicKey(AppConfig.placeRegistryProgram) : null
  const wallet = account ? toPublicKey(account.publicKey) : null
  const queryKey = ['keeper-royalties', places.join(','), connection.rpcEndpoint]

  const query = useQuery({
    queryKey,
    enabled: programId !== null,
    staleTime: 30_000,
    queryFn: async (): Promise<KeeperRoyalties> => {
      if (places.length === 0) {
        return EMPTY
      }
      const addresses = places.map((place) => new PublicKey(place))
      const [rentFloor, accounts] = await Promise.all([
        connection.getMinimumBalanceForRentExemption(PLACE_VAULT_SIZE),
        connection.getMultipleAccountsInfo([
          ...addresses.map((place) => placeVaultPda(place, programId!)),
          treasuryPda(programId!),
        ]),
      ])

      const treasuryAccount = accounts[accounts.length - 1]
      const vaults: PlaceRoyalties[] = []
      addresses.forEach((place, index) => {
        const account = accounts[index]
        if (!account) {
          // Aucun like ni dépôt sur ce lieu : la cagnotte n'existe pas encore.
          return
        }
        const vault = parsePlaceVault(account.data)
        vaults.push({
          place,
          pending: Math.max(account.lamports - rentFloor, 0),
          totalDistributed: Number(vault.totalDistributed),
          recentLikers: vault.recentLikers,
        })
      })

      return {
        places: vaults,
        pending: vaults.reduce((total, vault) => total + vault.pending, 0),
        distributed: vaults.reduce((total, vault) => total + vault.totalDistributed, 0),
        treasury: treasuryAccount ? parseTreasuryDestination(treasuryAccount.data) : null,
      }
    },
  })

  const distribute = useMutation({
    mutationKey: ['distribute-royalties', wallet?.toBase58() ?? null],
    mutationFn: async () => {
      const royalties = query.data
      if (!wallet || !programId || !royalties?.treasury) {
        throw new Error('Distribution indisponible : wallet ou trésorerie manquante')
      }
      const payable = royalties.places.filter((vault) => vault.pending > 0)
      if (payable.length === 0) {
        throw new Error('Aucune royaltie en attente')
      }

      const signatures: string[] = []
      for (let offset = 0; offset < payable.length; offset += PLACES_PER_TX) {
        const batch = payable.slice(offset, offset + PLACES_PER_TX)
        const instructions = batch.map((vault) =>
          distributeRoyaltiesInstruction(vault.place, wallet, royalties.treasury!, vault.recentLikers, programId),
        )
        const {
          context: { slot: minContextSlot },
          value: latestBlockhash,
        } = await connection.getLatestBlockhashAndContext()
        const message = new TransactionMessage({
          payerKey: wallet,
          recentBlockhash: latestBlockhash.blockhash,
          instructions,
        }).compileToLegacyMessage()

        const signature = await signAndSendTransactions(new VersionedTransaction(message), minContextSlot)
        await connection.confirmTransaction({ signature, ...latestBlockhash }, 'confirmed')
        signatures.push(signature)
      }
      return signatures
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey })
      // Le solde du wallet vient d'augmenter de la part gardien.
      queryClient.invalidateQueries({ queryKey: ['get-balance'] })
    },
  })

  return { ...query, data: query.data ?? EMPTY, distribute }
}
