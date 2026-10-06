import React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'
import { AppText } from '@/components/app-text'
import { PixelFont } from '@/components/app-theme'
import { CONFIRMED_MIN_VISITORS, isConfirmed } from '@/components/place/place-confirmation'
import { PixelGlyph } from '@/components/ui/pixel-glyph'
import { Palette } from '@/constants/colors'

/**
 * Statut « confirmé » d'un lieu (#44). Confirmé : pastille ambre (la couleur
 * de la rareté). Sinon : jauge pixel d'un carré par visiteur requis, et ce
 * qu'il manque — l'incitation à aller visiter, pas un reproche au gardien.
 */
export function PlaceConfirmationBadge({ distinctVisitors }: { distinctVisitors: number }) {
  const { t } = useTranslation()

  if (isConfirmed(distinctVisitors)) {
    return (
      <View style={styles.row}>
        <View style={styles.confirmed}>
          <PixelGlyph name="check" color={Palette.cream} cell={2} />
          <AppText style={styles.confirmedText}>{t('place.confirmed')}</AppText>
        </View>
        <AppText style={styles.hint}>{t('place.confirmedHint', { count: distinctVisitors })}</AppText>
      </View>
    )
  }

  const missing = CONFIRMED_MIN_VISITORS - distinctVisitors
  return (
    <View style={styles.row} accessibilityLabel={t('place.confirmProgress', { count: missing })}>
      <View style={styles.gauge}>
        {Array.from({ length: CONFIRMED_MIN_VISITORS }, (_, i) => (
          <View key={i} style={[styles.cell, i < distinctVisitors ? styles.cellOn : null]} />
        ))}
      </View>
      <AppText style={styles.hint}>{t('place.confirmProgress', { count: missing })}</AppText>
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  confirmed: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Palette.amber,
    borderWidth: 2,
    borderColor: Palette.plum,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  confirmedText: {
    fontFamily: PixelFont,
    fontSize: 8,
    color: Palette.cream,
  },
  gauge: {
    flexDirection: 'row',
    gap: 3,
  },
  cell: {
    width: 14,
    height: 14,
    borderWidth: 2,
    borderColor: Palette.plum,
    backgroundColor: Palette.cream,
  },
  cellOn: {
    backgroundColor: Palette.teal,
  },
  hint: {
    flexShrink: 1,
    color: Palette.terracotta,
    fontSize: 13,
  },
})
