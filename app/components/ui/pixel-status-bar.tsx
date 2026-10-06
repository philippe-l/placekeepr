import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { PixelFont } from '@/components/app-theme'
import { Colors } from '@/constants/colors'

/**
 * Bande de titre 8-bit (cf. statusbar des maquettes docs/design/placekeepr-sunset.html) :
 * titre en Press Start 2P à gauche, points de signal à droite.
 * `signal` = nombre de points allumés sur 4 — sur la carte il reflète la
 * qualité du fix GPS, ailleurs il peut rester omis (tout éteint).
 */
export function PixelStatusBar({ title, signal = 0 }: { title: string; signal?: number }) {
  return (
    <View style={styles.bar}>
      <Text style={styles.title}>{title.toUpperCase()}</Text>
      <View style={styles.dots}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={[styles.dot, { backgroundColor: i < signal ? Colors.tint : Colors.muted }]} />
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surface,
    borderBottomWidth: 3,
    borderBottomColor: Colors.border,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  title: {
    fontFamily: PixelFont,
    fontSize: 10,
    color: Colors.text,
  },
  dots: {
    flexDirection: 'row',
    gap: 4,
  },
  dot: {
    width: 7,
    height: 7,
  },
})
