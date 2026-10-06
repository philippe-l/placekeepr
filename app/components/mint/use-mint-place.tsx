import { mintV2, mplBubblegum } from '@metaplex-foundation/mpl-bubblegum'
import { createNoopSigner, none, publicKey, signerIdentity } from '@metaplex-foundation/umi'
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults'
import { fromWeb3JsPublicKey, toWeb3JsInstruction } from '@metaplex-foundation/umi-web3js-adapters'
import { PublicKey, TransactionMessage, VersionedTransaction } from '@solana/web3.js'
import { Base64 } from 'js-base64'
import { useMutation } from '@tanstack/react-query'
import { useMobileWallet } from '@wallet-ui/react-native-web3js'
import { AppConfig } from '@/constants/app-config'
import { appendMintLog } from '@/components/mint/mint-log'
import { uploadPlaceAssets } from '@/components/mint/place-metadata'
import { placeSlug } from '@/components/mint/place-slug'
import { cellE4, placePda, registerPlaceInstruction } from '@/components/mint/register-place'
import { placeVaultPda } from '@/components/place/place-vault'
import { verifyCaptureServer } from '@/components/mint/verify-capture'
import { syncMintLog } from '@/components/mint/sync-mint-log'
import { persistPlacePhoto } from '@/components/mint/persist-place-photo'
import { pixelatePlacePhoto } from '@/components/mint/pixelate-place-photo'
import { toPublicKey } from '@/utils/to-public-key'

// Repli si Supabase n'est pas configuré (mode local pur) : mint quand même,
// avec une URI placeholder — pas de JSON par lieu possible sans storage.
const PLACEHOLDER_METADATA_URI = 'https://placekeepr.app/metadata/placeholder.json'

export { placeSlug } from '@/components/mint/place-slug'

export interface MintPlaceInput {
  latitude: number
  longitude: number
  // Précision du fix GPS (m) au déclenchement — exigée par la vérif serveur.
  accuracy: number
  // URI temporaire de la photo du lieu (caméra) : uploadée avant le mint
  // (place-metadata.ts) puis persistée localement comme preuve.
  photoUri?: string
}

/**
 * Mint un cNFT « lieu » sur l'arbre (EXPO_PUBLIC_MERKLE_TREE) : l'instruction
 * est construite avec Umi/Bubblegum, signée et envoyée via MWA.
 *
 * L'arbre est PRIVÉ (#40) et son délégué est le vérifieur : un mint n'y entre
 * qu'avec sa co-signature, donc qu'après la vérif GPS et l'inspection du mint
 * par `/verify-capture`. Le mode dégradé sans registre (pas de co-signature)
 * exige par conséquent un arbre public, créé avec `PUBLIC_TREE=1`.
 */
export function useMintPlace() {
  const { account, connection, signAndSendTransactions } = useMobileWallet()

  return useMutation({
    mutationKey: ['mint-place', { endpoint: connection.rpcEndpoint }],
    mutationFn: async ({ latitude, longitude, accuracy, photoUri }: MintPlaceInput) => {
      if (!account) {
        throw new Error('Wallet non connecté')
      }
      if (!AppConfig.merkleTree) {
        throw new Error('EXPO_PUBLIC_MERKLE_TREE manquant — lancer "npm run create-tree" puis renseigner .env')
      }

      const payer = toPublicKey(account.publicKey)
      const owner = fromWeb3JsPublicKey(payer)
      const name = `PK ${placeSlug(latitude, longitude)}`

      // Assets uploadés avant le mint : l'URI des métadonnées entre dans
      // l'instruction. Échec d'upload = échec de la capture (le mint exige
      // le réseau de toute façon) ; null = Supabase non configuré.
      const assets = photoUri
        ? await uploadPlaceAssets({ name, latitude, longitude, photoUri, capturedAt: new Date().toISOString() })
        : null
      // Umi ne sert qu'à construire l'instruction : le signataire réel est le
      // wallet MWA, d'où l'identité noop.
      const umi = createUmi(connection.rpcEndpoint)
        .use(mplBubblegum())
        .use(signerIdentity(createNoopSigner(owner)))

      // Créateur du cNFT : la cagnotte du lieu, pas le gardien. Le
      // `creators[]` de Bubblegum est figé au mint et ne peut donc pas porter
      // un split dont la composition change à chaque like — le partage se
      // fait à la distribution, côté programme. Non vérifié : le PDA ne signe
      // pas le mint, et le versement des royalties cNFT reste de toute façon
      // volontaire côté marketplace. Sans registre (mode dégradé), il n'y a
      // pas de lieu on-chain : le gardien reste créateur.
      const registryProgram = AppConfig.placeRegistryProgram ? new PublicKey(AppConfig.placeRegistryProgram) : null
      const royaltyVault = registryProgram
        ? placeVaultPda(placePda(cellE4(latitude), cellE4(longitude), registryProgram), registryProgram)
        : null

      // Délégué de l'arbre privé = vérifieur, qui co-signe déjà la tx de
      // capture : pas de signature de plus pour l'utilisateur. Noop signer ici,
      // la vraie signature arrive de /verify-capture.
      if (registryProgram && !AppConfig.placeVerifier) {
        throw new Error('EXPO_PUBLIC_PLACE_VERIFIER manquant — requis pour minter dans l’arbre privé')
      }
      const treeDelegate = registryProgram ? createNoopSigner(publicKey(AppConfig.placeVerifier)) : undefined

      const builder = mintV2(umi, {
        merkleTree: publicKey(AppConfig.merkleTree),
        treeCreatorOrDelegate: treeDelegate,
        leafOwner: owner,
        metadata: {
          name,
          symbol: 'PLACE',
          uri: assets?.metadataUri ?? PLACEHOLDER_METADATA_URI,
          sellerFeeBasisPoints: 500,
          isMutable: true,
          creators: [
            { address: royaltyVault ? fromWeb3JsPublicKey(royaltyVault) : owner, verified: false, share: 100 },
          ],
          collection: none(),
        },
      })

      // Registre d'unicité on-chain devant le mint : si la cellule est déjà
      // prise, l'init du PDA échoue et toute la transaction avec — le cNFT
      // n'est jamais minté sans son registre.
      const registerIx = registerPlaceInstruction(payer, latitude, longitude)
      const instructions = [...(registerIx ? [registerIx] : []), ...builder.getInstructions().map(toWeb3JsInstruction)]
      const {
        context: { slot: minContextSlot },
        value: latestBlockhash,
      } = await connection.getLatestBlockhashAndContext()

      const message = new TransactionMessage({
        payerKey: payer,
        recentBlockhash: latestBlockhash.blockhash,
        instructions,
      }).compileToV0Message()
      const transaction = new VersionedTransaction(message)

      // Verdict serveur + co-signature du vérifieur : l'edge function inspecte
      // la transaction (bonnes coordonnées, bon keeper) avant de la signer —
      // le programme exige cette signature. Sans registre : simple verdict.
      // Jette CaptureRejected si la capture est implausible.
      const verifierSignature = await verifyCaptureServer({
        minter: payer.toBase58(),
        latitude,
        longitude,
        accuracy,
        message: registerIx ? Base64.fromUint8Array(transaction.message.serialize()) : undefined,
      })
      if (registerIx) {
        if (!verifierSignature) {
          throw new Error('Co-signature du vérifieur indisponible — l’API est requise avec le registre')
        }
        transaction.addSignature(new PublicKey(AppConfig.placeVerifier), Base64.toUint8Array(verifierSignature))
      }

      const signature = await signAndSendTransactions(transaction, minContextSlot)
      await connection.confirmTransaction({ signature, ...latestBlockhash }, 'confirmed')
      console.log(`Mint confirmé : ${signature} (${placeSlug(latitude, longitude)})`)

      let persistedPhotoUri: string | undefined
      let thumbUri: string | undefined
      if (photoUri) {
        try {
          persistedPhotoUri = persistPlacePhoto(photoUri, signature)
        } catch (error) {
          // Le mint a réussi : on ne le fait pas échouer pour une photo.
          console.warn('Photo non persistée', error)
        }
        try {
          thumbUri = await pixelatePlacePhoto(photoUri, signature)
        } catch (error) {
          // Idem : la miniature est un confort d'affichage, pas une preuve.
          console.warn('Miniature non générée', error)
        }
      }

      // Journal local (source d'affichage de l'app — comptabilité, voir CLAUDE.md).
      await appendMintLog({
        signature,
        latitude,
        longitude,
        photoUri: persistedPhotoUri,
        thumbUri,
        endpoint: connection.rpcEndpoint,
        mintedAt: new Date().toISOString(),
        minter: payer.toBase58(),
        placeId: assets?.placeId,
      })

      // Miroir Supabase : best-effort, le mint est déjà réussi et journalisé.
      syncMintLog().catch((error) => console.warn('Sync backend échouée', error))

      return signature
    },
  })
}
