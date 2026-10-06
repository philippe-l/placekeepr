import React, { useState } from 'react'
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native'
import { PixelFont } from '@/components/app-theme'
import { Colors } from '@/constants/colors'

export type PixelButtonVariant = 'primary' | 'secondary' | 'danger' | 'like' | 'reputation'

export interface PixelButtonProps {
  title: string
  onPress?: () => void
  variant?: PixelButtonVariant
  disabled?: boolean
  style?: ViewStyle
}

const VARIANTS: Record<PixelButtonVariant, { background: string; label: string }> = {
  primary: { background: Colors.tint, label: Colors.onPrimary },
  secondary: { background: Colors.surface, label: Colors.text },
  danger: { background: Colors.danger, label: Colors.onPrimary },
  // Teal = aimer/visite, amber = contextes réputation (rare) — handoff design.
  like: { background: Colors.accent, label: Colors.onPrimary },
  reputation: { background: Colors.gold, label: Colors.onPrimary },
}

/**
 * Bouton 8-bit : bordure épaisse, ombre dure (pas de flou), pas d'arrondi.
 * L'appui « enfonce » le bouton dans son ombre, façon bouton de console.
 * Désactivé : fond secondaire désaturé (cf. états du handoff sunset).
 */
export function PixelButton({ title, onPress, variant = 'primary', disabled, style }: PixelButtonProps) {
  const [pressed, setPressed] = useState(false)

  const { background, label } = disabled
    ? { background: Colors.secondary, label: Colors.background }
    : VARIANTS[variant]

  const lifted = !pressed && !disabled

  return (
    <View style={[styles.shadowBox, { backgroundColor: Colors.shadow }, style]}>
      <Pressable
        accessibilityRole="button"
        disabled={disabled}
        onPress={onPress}
        onPressIn={() => setPressed(true)}
        onPressOut={() => setPressed(false)}
        style={[
          styles.face,
          {
            backgroundColor: background,
            borderColor: Colors.border,
            opacity: disabled ? 0.7 : 1,
            transform: [{ translateX: lifted ? -4 : 0 }, { translateY: lifted ? -4 : 0 }],
          },
        ]}
      >
        <Text style={[styles.label, { color: label }]}>{title.toUpperCase()}</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  shadowBox: {
    marginTop: 4,
    marginLeft: 4,
    alignSelf: 'stretch',
  },
  face: {
    borderWidth: 3,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  label: {
    fontFamily: PixelFont,
    fontSize: 12,
    lineHeight: 16,
  },
})
