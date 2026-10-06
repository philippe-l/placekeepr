import React from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { AppText } from '@/components/app-text'
import { PixelFont } from '@/components/app-theme'
import { PixelGlyph, PixelGlyphName } from '@/components/ui/pixel-glyph'
import { Palette } from '@/constants/colors'

/**
 * Ligne de feed (handoff design §06) : glyphe + titre + méta. La variante
 * highlight (amber sur plum) célèbre un palier franchi.
 */
export function ActivityRow({
  glyph,
  glyphColor,
  title,
  meta,
  highlight = false,
  onPress,
}: {
  glyph: PixelGlyphName
  glyphColor: string
  title: string
  meta?: string
  highlight?: boolean
  onPress?: () => void
}) {
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      disabled={!onPress}
      onPress={onPress}
      style={[styles.row, highlight ? styles.rowHighlight : null]}
    >
      <View style={[styles.glyphBox, highlight ? styles.glyphBoxHighlight : null]}>
        <PixelGlyph name={glyph} color={glyphColor} cell={3} />
      </View>
      <View style={styles.body}>
        <AppText style={[styles.title, highlight ? styles.titleHighlight : null]}>{title}</AppText>
        {meta ? <AppText style={[styles.meta, highlight ? styles.metaHighlight : null]}>{meta}</AppText> : null}
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 2,
    borderColor: Palette.plum,
    backgroundColor: Palette.sand,
    padding: 12,
  },
  rowHighlight: {
    backgroundColor: Palette.plum,
    borderColor: Palette.amber,
  },
  glyphBox: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Palette.cream,
    borderWidth: 2,
    borderColor: Palette.plum,
  },
  glyphBoxHighlight: {
    backgroundColor: Palette.ink,
    borderColor: Palette.amber,
  },
  body: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 14,
    color: Palette.plum,
  },
  titleHighlight: {
    fontFamily: PixelFont,
    fontSize: 9,
    lineHeight: 14,
    color: Palette.amber,
  },
  meta: {
    fontSize: 12,
    color: Palette.terracotta,
  },
  metaHighlight: {
    color: Palette.cream,
  },
})
