import { Image } from 'expo-image'
import React from 'react'
import { StyleSheet, View } from 'react-native'
import { PixelGlyph } from '@/components/ui/pixel-glyph'
import { Palette } from '@/constants/colors'
import { assetUrl } from '@/utils/backend'

/**
 * Avatar d'un gardien : son image pixelisée s'il en a posé une, l'étoile 8-bit
 * sinon. Le repli est le cas normal — la plupart des wallets n'auront pas
 * d'avatar, et le cadre doit garder exactement la même empreinte dans les deux
 * cas pour que les listes ne sautent pas.
 *
 * L'image est déjà pixelisée dans le PNG (utils/pixelate.ts) : `contentFit`
 * en « cover » suffit, il n'y a rien à préserver de plus au redimensionnement.
 */
export function ProfileAvatar({
  avatarPath,
  size = 32,
  borderColor = Palette.cream,
  glyphColor = Palette.cream,
}: {
  /** Chemin d'asset, et non un `Profile` : le formulaire prévisualise un avatar
   *  déposé mais pas encore enregistré, qui n'appartient à aucun profil. */
  avatarPath?: string | null
  size?: number
  borderColor?: string
  glyphColor?: string
}) {
  const url = assetUrl(avatarPath)
  // La grille du glyphe fait 7 cellules de large : on la cale sur la taille
  // demandée pour que les deux états occupent le même carré.
  const cell = Math.max(2, Math.floor(size / 8))

  return (
    <View style={[styles.frame, { borderColor, width: size + 12, height: size + 12 }]}>
      {url ? (
        <Image source={{ uri: url }} style={{ width: size, height: size }} contentFit="cover" />
      ) : (
        <PixelGlyph name="star" color={glyphColor} cell={cell} />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  frame: {
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
