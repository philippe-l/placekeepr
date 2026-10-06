import React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'
import { AppText } from '@/components/app-text'
import { PixelFont } from '@/components/app-theme'
import { Palette } from '@/constants/colors'

/**
 * Badge « SKR-BACKED » : le gardien a du SKR staké sur mainnet (lu par le
 * serveur, jamais signé depuis l'app). Rose, la seule couleur de la palette
 * qui ne porte pas déjà un sens — l'ambre est à la réputation, le teal à
 * l'engagement.
 */
export function SkrBadge() {
  const { t } = useTranslation()
  return (
    <View style={styles.badge}>
      <AppText style={styles.text}>{t('skr.backed')}</AppText>
    </View>
  )
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: Palette.pink,
    borderWidth: 2,
    borderColor: Palette.cream,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  text: {
    fontFamily: PixelFont,
    fontSize: 8,
    color: Palette.cream,
  },
})
