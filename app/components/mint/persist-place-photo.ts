import { Directory, File, Paths } from 'expo-file-system'

/**
 * Copie la photo (URI temporaire du picker) vers le répertoire documents,
 * nommée par la signature du mint. Stockage local en attendant Supabase Storage.
 */
export function persistPlacePhoto(tempUri: string, signature: string): string {
  const dir = new Directory(Paths.document, 'mints')
  dir.create({ intermediates: true, idempotent: true })
  const destination = new File(dir, `${signature}.jpg`)
  new File(tempUri).copy(destination)
  return destination.uri
}
