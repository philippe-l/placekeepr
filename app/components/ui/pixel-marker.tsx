import React from 'react'
import { StyleSheet, View } from 'react-native'
import { Palette } from '@/constants/colors'

/**
 * Marqueur de lieu pixel-art (cf. docs/design/placekeepr-sunset.html et
 * scripts/build-app-icons.mjs — même motif que l'icône de l'app) :
 * tête carrée bordée + losange sombre (étoile 4 branches) + pied.
 * Corail = mes lieux (défaut), teal = autres gardiens. Pastille ambre =
 * lieu confirmé, marqueur atténué = lieu d'un autre gardien pas encore confirmé.
 * À utiliser dans un <Marker anchor="bottom"> pour que le pied pointe la coordonnée.
 */
export function PixelMarker({
  color = Palette.coral,
  confirmed = false,
  dimmed = false,
}: {
  color?: string
  /** Lieu confirmé (#44) : pastille ambre en coin, la couleur de la rareté. */
  confirmed?: boolean
  /** Lieu non confirmé d'un autre gardien : présent, mais en retrait. */
  dimmed?: boolean
}) {
  return (
    <View style={[styles.root, dimmed ? styles.dimmed : null]}>
      <View style={[styles.head, { backgroundColor: color }]}>
        <View style={styles.diamond} />
        {confirmed ? <View style={styles.pip} /> : null}
      </View>
      <View style={[styles.stem, { backgroundColor: color }]} />
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
  },
  head: {
    width: 24,
    height: 24,
    borderWidth: 3,
    borderColor: Palette.mapStroke,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dimmed: {
    opacity: 0.55,
  },
  pip: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 9,
    height: 9,
    backgroundColor: Palette.amber,
    borderWidth: 2,
    borderColor: Palette.mapStroke,
  },
  diamond: {
    position: 'absolute',
    width: 9,
    height: 9,
    backgroundColor: Palette.ink,
    transform: [{ rotate: '45deg' }],
  },
  stem: {
    width: 8,
    height: 8,
    borderWidth: 2,
    borderTopWidth: 0,
    borderColor: Palette.mapStroke,
  },
})
