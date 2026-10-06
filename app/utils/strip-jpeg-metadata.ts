/**
 * Retire d'un JPEG ses métadonnées d'identification, sans le réencoder : les
 * segments APP1 (EXIF, XMP — modèle du téléphone, heure exacte, parfois GPS),
 * APP13 (IPTC) et COM. Les pixels, APP0 (JFIF), APP2 (profil couleur) et
 * APP14 (Adobe) restent intacts.
 *
 * Audit du 29/09/2026 : les photos publiées gardaient « Solana Mobile Inc. /
 * Seeker » et l'horodatage à la seconde. Pas de GPS (le sélecteur ne l'écrit
 * pas), mais rien ne garantit qu'une autre caméra s'en abstienne.
 *
 * Appelé AVANT le sha256 qui nomme la photo : le nom reste le contenu publié.
 * Un fichier qui n'a pas la forme attendue est rendu tel quel, jamais tronqué.
 */
const STRIPPED = new Set([0xe1, 0xed, 0xfe])

export function stripJpegMetadata(bytes: Uint8Array): Uint8Array {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return bytes
  }
  const kept: Uint8Array[] = [bytes.subarray(0, 2)]
  let offset = 2
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) {
      return bytes // structure inattendue : ne rien risquer
    }
    const marker = bytes[offset + 1]!
    if (marker === 0xff) {
      offset += 1 // octet de remplissage
      continue
    }
    if (marker === 0xda) {
      // Début du flux d'image (SOS) : tout le reste est recopié tel quel.
      kept.push(bytes.subarray(offset))
      const out = new Uint8Array(kept.reduce((sum, part) => sum + part.length, 0))
      let at = 0
      for (const part of kept) {
        out.set(part, at)
        at += part.length
      }
      return out
    }
    const length = (bytes[offset + 2]! << 8) | bytes[offset + 3]!
    if (length < 2 || offset + 2 + length > bytes.length) {
      return bytes
    }
    if (!STRIPPED.has(marker)) {
      kept.push(bytes.subarray(offset, offset + 2 + length))
    }
    offset += 2 + length
  }
  return bytes
}
