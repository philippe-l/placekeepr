import * as ImagePicker from 'expo-image-picker'
import QuickCrypto from 'react-native-quick-crypto'
import { getBackend } from '@/utils/backend'
import { pixelateToPng } from '@/utils/pixelate'

/**
 * Avatar : grille de 32 px × 6 = 192 px de côté. Deux fois plus grossier que
 * la miniature d'un lieu (64 px) — à la taille où il s'affiche, une grille
 * fine ne se lit plus comme du pixel-art, elle se lit comme une photo floue.
 *
 * Pas de caméra ici, contrairement à la capture d'un lieu : un avatar n'est
 * pas une preuve de présence, rien n'oblige à le prendre sur le moment.
 */
const AVATAR = { gridWidth: 32, scale: 6, levels: 5 }

/** URI locale choisie par l'utilisateur, ou `null` s'il a annulé. */
export async function pickAvatarImage(): Promise<string | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    // Recadrage carré imposé : l'avatar s'affiche en carré partout, autant que
    // ce soit l'utilisateur qui choisisse ce qui est coupé.
    allowsEditing: true,
    aspect: [1, 1],
    quality: 1,
    exif: false,
  })
  return result.canceled ? null : (result.assets[0]?.uri ?? null)
}

/**
 * Pixelise puis dépose l'avatar, et rend son chemin d'asset.
 *
 * Nommage par le **contenu**, comme les photos de lieu : reprendre deux fois
 * la même image retombe sur le même chemin au lieu d'abandonner un orphelin de
 * plus dans le bucket. Le conflit est donc toléré (`skip`), il signifie
 * exactement « déjà déposé ».
 */
export async function uploadAvatar(uri: string): Promise<string> {
  const backend = getBackend()
  if (!backend) {
    throw new Error('Backend non configuré — renseigner EXPO_PUBLIC_API_URL')
  }
  const png = await pixelateToPng(uri, AVATAR)
  const hash = QuickCrypto.createHash('sha256').update(png).digest('hex').slice(0, 32)
  const path = `${hash}.png`
  await backend.uploadAsset({ path, bytes: png, contentType: 'image/png', ifExists: 'skip' })
  return path
}
