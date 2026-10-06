import React, { PropsWithChildren } from 'react'
import { StyleSheet, View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native'
import { Palette } from '@/constants/colors'
import { useThemeColor } from '@/hooks/use-theme-color'

/** Accent de bordure : corail = mon lieu, teal = gardien/autre, amber = réputation, orange = frais/revenus. */
export type PixelCardAccent = 'coral' | 'teal' | 'amber' | 'orange' | 'none'

export interface PixelCardProps extends ViewProps {
  accent?: PixelCardAccent
  /** dashed = emplacement « bientôt » : bordure pointillée, sans ombre dure. */
  variant?: 'solid' | 'dashed'
  /**
   * Style de la face interne. Sert aux cartes posées dans un conteneur de
   * hauteur bornée (l'overlay de la carte) : sans `flexShrink` sur la face,
   * elle se dimensionne sur son contenu et déborde du cadre qui la porte.
   */
  contentStyle?: StyleProp<ViewStyle>
}

const ACCENTS: Record<Exclude<PixelCardAccent, 'none'>, string> = {
  coral: Palette.coral,
  teal: Palette.teal,
  amber: Palette.amber,
  orange: Palette.orange,
}

/**
 * Carte 8-bit : bordure épaisse + ombre dure décalée, sans arrondi.
 */
export function PixelCard({
  children,
  style,
  contentStyle,
  accent = 'none',
  variant = 'solid',
  ...props
}: PropsWithChildren<PixelCardProps>) {
  const border = useThemeColor('border')
  const shadow = useThemeColor('shadow')
  const surface = useThemeColor('surface')
  const borderColor = accent === 'none' ? border : ACCENTS[accent]

  if (variant === 'dashed') {
    return (
      <View
        style={[styles.face, styles.dashed, { backgroundColor: surface, borderColor }, style, contentStyle]}
        {...props}
      >
        {children}
      </View>
    )
  }

  return (
    <View style={[styles.shadowBox, { backgroundColor: shadow }, style]} {...props}>
      <View style={[styles.face, { backgroundColor: surface, borderColor }, contentStyle]}>{children}</View>
    </View>
  )
}

const styles = StyleSheet.create({
  shadowBox: {
    marginTop: 4,
    marginLeft: 4,
  },
  face: {
    borderWidth: 3,
    padding: 16,
    gap: 8,
    transform: [{ translateX: -4 }, { translateY: -4 }],
  },
  dashed: {
    borderWidth: 2,
    borderStyle: 'dashed',
    transform: [],
  },
})
