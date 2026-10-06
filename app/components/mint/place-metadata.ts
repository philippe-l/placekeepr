import { stripJpegMetadata } from '@/utils/strip-jpeg-metadata'
import { File } from 'expo-file-system'
import { Base64 } from 'js-base64'
import QuickCrypto from 'react-native-quick-crypto'
import { placeSlug } from '@/components/mint/place-slug'
import { AppConfig } from '@/constants/app-config'
import { getBackend } from '@/utils/backend'

/**
 * Upload pré-mint des assets d'un lieu : la photo, puis le JSON de métadonnées
 * (standard Metaplex) qui pointe dessus. Nommage par `placeId` et non par
 * signature : l'URI doit entrer dans l'instruction mintV2, donc exister avant la
 * signature.
 *
 * `placeId` est dérivé du **contenu** de la photo, pas tiré au hasard : une
 * reprise de la même capture (mint refusé, wallet sur le mauvais compte…)
 * retombe sur les mêmes chemins au lieu d'abandonner une paire de fichiers de
 * plus. Le 10/09/2026, cinq tentatives sur une même photo ont laissé cinq
 * paires dont une seule référencée on-chain. Corollaire : les deux dépôts
 * tolèrent le conflit, puisque retomber sur un chemin existant est le
 * comportement recherché.
 */

export interface PlaceAssets {
  placeId: string
  metadataUri: string
  photoPath: string
  metadataPath: string
}

export interface PlaceAssetsInput {
  // Nom on-chain du cNFT (repris tel quel dans le JSON).
  name: string
  latitude: number
  longitude: number
  photoUri: string
  capturedAt: string
}

export async function uploadPlaceAssets(input: PlaceAssetsInput): Promise<PlaceAssets | null> {
  const backend = getBackend()
  if (!backend) {
    // Backend non configuré : le mint retombera sur l'URI placeholder.
    return null
  }
  // Métadonnées d'identification retirées avant le hash : c'est la photo
  // publiée, sans EXIF, qui porte le nom (audit du 29/09/2026).
  const photo = stripJpegMetadata(await new File(input.photoUri).bytes())
  const placeId = QuickCrypto.createHash('sha256').update(photo).digest('hex').slice(0, 32)

  const photoPath = `${placeId}.jpg`
  const imageUrl = await backend.uploadAsset({
    path: photoPath,
    bytes: photo,
    contentType: 'image/jpeg',
    ifExists: 'skip',
  })

  const slug = placeSlug(input.latitude, input.longitude)
  const metadata = {
    name: input.name,
    symbol: 'PLACE',
    description: 'Proof-of-location capture on PlaceKeepr — minted by the first keeper of this place.',
    image: imageUrl,
    external_url: AppConfig.uri,
    attributes: [
      // Coordonnées à la précision de la grille d'unicité (placeSlug),
      // pas le GPS brut — c'est la cellule qui fait foi, publique par design.
      { trait_type: 'latitude', value: slug.split(',')[0] },
      { trait_type: 'longitude', value: slug.split(',')[1] },
      { trait_type: 'captured_at', value: input.capturedAt },
    ],
    properties: {
      files: [{ uri: imageUrl, type: 'image/jpeg' }],
      category: 'image',
    },
  }

  const metadataPath = `${placeId}.json`
  // Encodage UTF-8 sans TextEncoder (absent de Hermes) : aller-retour js-base64.
  const body = Base64.toUint8Array(Base64.encode(JSON.stringify(metadata)))
  const metadataUri = await backend.uploadAsset({
    path: metadataPath,
    bytes: body,
    contentType: 'application/json',
    ifExists: 'skip',
  })

  return { placeId, metadataUri, photoPath, metadataPath }
}
