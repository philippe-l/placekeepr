import React from 'react'
import { StyleSheet, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { AppText } from '@/components/app-text'
import { PixelGlyph, PixelGlyphName } from '@/components/ui/pixel-glyph'
import { Palette } from '@/constants/colors'

/**
 * Badges jalons (handoff design §5) : gagnés = amber sur ink, verrouillés =
 * terracotta atténué. V1 : les trois jalons calculables avec les données
 * disponibles — les suivants (fidélité, territoire) viendront avec l'historique.
 */
interface Badge {
  key: string
  glyph: PixelGlyphName
  earned: boolean
}

export function BadgesRow({ placesCount, maxPlaceLikes }: { placesCount: number; maxPlaceLikes: number }) {
  const { t } = useTranslation()
  const badges: Badge[] = [
    { key: 'firstCapture', glyph: 'star', earned: placesCount >= 1 },
    { key: 'tenPlaces', glyph: 'star', earned: placesCount >= 10 },
    { key: 'popularPlace', glyph: 'heart', earned: maxPlaceLikes >= 50 },
  ]

  return (
    <View style={styles.section}>
      <AppText type="subtitle">{t('keeper.badges')}</AppText>
      <View style={styles.row}>
        {badges.map((badge) => (
          <View key={badge.key} style={styles.badge}>
            <View style={[styles.tile, badge.earned ? styles.tileEarned : styles.tileLocked]}>
              <PixelGlyph name={badge.glyph} color={badge.earned ? Palette.amber : Palette.terracotta} cell={4} />
            </View>
            <AppText style={[styles.label, badge.earned ? styles.labelEarned : styles.labelLocked]}>
              {t(`keeper.badge.${badge.key}`)}
            </AppText>
          </View>
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  section: {
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  badge: {
    alignItems: 'center',
    gap: 4,
    flex: 1,
  },
  tile: {
    width: 46,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  tileEarned: {
    backgroundColor: Palette.ink,
    borderColor: Palette.amber,
  },
  tileLocked: {
    backgroundColor: Palette.sand,
    borderColor: Palette.terracotta,
    opacity: 0.6,
  },
  label: {
    fontSize: 11,
    textAlign: 'center',
  },
  labelEarned: {
    color: Palette.plum,
  },
  labelLocked: {
    color: Palette.terracotta,
  },
})
