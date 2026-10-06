import React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, Text, View } from 'react-native'
import { AppText } from '@/components/app-text'
import { PixelFont } from '@/components/app-theme'
import { Colors } from '@/constants/colors'

// 48.8584°N — 4 décimales comme la maquette, hémisphère plutôt que signe.
export function formatCoord(value: number, axis: 'lat' | 'lon') {
  const hemisphere = axis === 'lat' ? (value >= 0 ? 'N' : 'S') : value >= 0 ? 'E' : 'W'
  return `${Math.abs(value).toFixed(4)}°${hemisphere}`
}

/**
 * Bloc coordonnées GPS de l'écran carte (écran 1 du design sunset) :
 * lat/lon empilées en Press Start 2P corail, précision à droite (valeur en or),
 * bordure corail + ombre dure sur fond crème.
 */
export function CoordCard({
  latitude,
  longitude,
  accuracy,
  hasPermission,
}: {
  latitude?: number
  longitude?: number
  accuracy?: number | null
  hasPermission: boolean
}) {
  const { t } = useTranslation()
  return (
    <View style={styles.shadowBox}>
      <View style={styles.face}>
        {latitude != null && longitude != null ? (
          <>
            <View>
              <Text style={styles.coord}>{formatCoord(latitude, 'lat')}</Text>
              <Text style={styles.coord}>{formatCoord(longitude, 'lon')}</Text>
            </View>
            <View style={styles.acc}>
              <AppText style={styles.accLabel}>{t('map.accuracy')}</AppText>
              <AppText style={styles.accLabel}>
                {accuracy ? <AppText style={styles.accValue}>±{Math.round(accuracy)} m</AppText> : null}
                {accuracy ? ' · GPS' : 'GPS'}
              </AppText>
            </View>
          </>
        ) : (
          <AppText style={styles.accLabel}>{hasPermission ? t('map.searchingGps') : t('map.locationDenied')}</AppText>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  shadowBox: {
    marginTop: 4,
    marginLeft: 4,
    backgroundColor: Colors.shadow,
  },
  face: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.background,
    borderWidth: 3,
    borderColor: Colors.tint,
    paddingHorizontal: 10,
    paddingVertical: 8,
    transform: [{ translateX: -4 }, { translateY: -4 }],
  },
  coord: {
    fontFamily: PixelFont,
    fontSize: 10,
    lineHeight: 17,
    color: Colors.tint,
  },
  acc: {
    alignItems: 'flex-end',
  },
  accLabel: {
    fontSize: 12,
    lineHeight: 16,
    color: Colors.text,
  },
  accValue: {
    fontSize: 12,
    lineHeight: 16,
    color: Colors.gold,
  },
})
