import { Directory, File, Paths } from 'expo-file-system'
import { pixelateToPng } from '@/utils/pixelate'

/**
 * Miniature pixel-art d'une photo de lieu : la photo originale reste la preuve
 * (persist-place-photo.ts), la miniature sert à l'affichage dans l'app.
 *
 * Le traitement lui-même vit dans `utils/pixelate.ts`, partagé avec les
 * avatars ; ici il ne reste que le format et l'écriture sur disque.
 */
const PLACE_THUMB = { gridWidth: 64, scale: 6, levels: 5 }

export async function pixelatePlacePhoto(photoUri: string, signature: string): Promise<string> {
  const png = await pixelateToPng(photoUri, PLACE_THUMB)
  const dir = new Directory(Paths.document, 'mints')
  dir.create({ intermediates: true, idempotent: true })
  const destination = new File(dir, `${signature}.thumb.png`)
  destination.write(png)
  return destination.uri
}
