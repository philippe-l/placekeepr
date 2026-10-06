import React from 'react'
import { StyleSheet, View } from 'react-native'
import { Palette } from '@/constants/colors'

/** Barre de progression pixel : bordure et remplissage amber sur fond ink. */
export function ReputationBar({ progress }: { progress: number }) {
  const clamped = Math.max(0, Math.min(1, progress))
  return (
    <View style={styles.track}>
      <View style={[styles.fill, { width: `${clamped * 100}%` }]} />
    </View>
  )
}

const styles = StyleSheet.create({
  track: {
    alignSelf: 'stretch',
    height: 14,
    borderWidth: 2,
    borderColor: Palette.amber,
    backgroundColor: Palette.ink,
  },
  fill: {
    height: '100%',
    backgroundColor: Palette.amber,
  },
})
