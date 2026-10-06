import { File } from 'expo-file-system'
import { removeMintLog } from '@/components/mint/mint-log'

/**
 * Supprime un lieu du journal local + ses fichiers (photo preuve, miniature).
 * Le cNFT reste on-chain : c'est un nettoyage d'essais devnet, pas un burn.
 */
export async function forgetPlace(signature: string): Promise<void> {
  const entry = await removeMintLog(signature)
  for (const uri of [entry?.photoUri, entry?.thumbUri]) {
    // Une entrée restaurée depuis le backend pointe vers le serveur : il n'y a
    // pas de fichier local à supprimer, et la preuve distante n'est jamais
    // effacée (règle « une preuve n'est jamais réécrite »).
    if (!uri?.startsWith('file:')) {
      continue
    }
    try {
      new File(uri).delete()
    } catch (error) {
      // Fichier déjà absent : l'entrée du journal est partie, c'est l'essentiel.
      console.warn('Fichier non supprimé', uri, error)
    }
  }
}
