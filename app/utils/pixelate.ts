import { ImageManipulator, SaveFormat } from 'expo-image-manipulator'
import { decode as decodeJpeg } from 'jpeg-js'
import { Base64 } from 'js-base64'
import { encodePng } from '@/utils/encode-png'

/**
 * Pixelisation 8-bit d'une image, en PNG. Extrait de `pixelate-place-photo.ts`
 * quand les avatars ont eu besoin du même traitement à une autre échelle.
 *
 * Pipeline 100 % JS (pas de canvas ni de Skia en RN) :
 *  1. downscale natif vers une grille de `gridWidth` px (expo-image-manipulator),
 *  2. posterisation (`levels` niveaux par canal) pour l'aplat 8-bit,
 *  3. upscale ×`scale` au plus proche voisin — le rendu pixelisé est figé dans
 *     le PNG, car les <Image> RN lissent toujours à l'agrandissement.
 */

export interface PixelateOptions {
  /** Largeur de la grille de pixels avant agrandissement. */
  gridWidth: number
  /** Facteur d'agrandissement, au plus proche voisin. */
  scale: number
  /** Niveaux par canal de la posterisation. */
  levels: number
}

export async function pixelateToPng(uri: string, { gridWidth, scale, levels }: PixelateOptions): Promise<Uint8Array> {
  const image = await ImageManipulator.manipulate(uri).resize({ width: gridWidth }).renderAsync()
  const small = await image.saveAsync({ format: SaveFormat.JPEG, compress: 1, base64: true })
  if (!small.base64) {
    throw new Error('downscale sans base64')
  }

  const { width, height, data } = decodeJpeg(Base64.toUint8Array(small.base64), { useTArray: true })

  const step = 255 / (levels - 1)
  const outWidth = width * scale
  const outHeight = height * scale
  const out = new Uint8Array(outWidth * outHeight * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const r = Math.round(data[i] / step) * step
      const g = Math.round(data[i + 1] / step) * step
      const b = Math.round(data[i + 2] / step) * step
      for (let dy = 0; dy < scale; dy++) {
        const row = ((y * scale + dy) * outWidth + x * scale) * 4
        for (let dx = 0; dx < scale; dx++) {
          const o = row + dx * 4
          out[o] = r
          out[o + 1] = g
          out[o + 2] = b
          out[o + 3] = 255
        }
      }
    }
  }

  return encodePng({ width: outWidth, height: outHeight, data: out })
}
