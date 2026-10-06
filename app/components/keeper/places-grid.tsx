import { Image } from 'expo-image'
import React from 'react'
import { StyleSheet, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { AppText } from '@/components/app-text'
import { KeeperPlace } from '@/components/keeper/use-keeper-places'
import { isConfirmed } from '@/components/place/place-confirmation'
import { MintLogEntry } from '@/components/mint/mint-log'
import { cellE4 } from '@/components/mint/register-place'
import { PixelGlyph } from '@/components/ui/pixel-glyph'
import { Palette } from '@/constants/colors'

/**
 * Collection du gardien : miniatures pixel-art du journal local, compteur de
 * likes (miroir Supabase, joint par cellule) au coin. Tri : likes puis date.
 */
export function PlacesGrid({ entries, places }: { entries: MintLogEntry[]; places: KeeperPlace[] }) {
  const { t } = useTranslation()
  const byCell = new Map(places.map((place) => [`${place.latE4},${place.lngE4}`, place]))

  const items = entries
    .map((entry) => {
      const place = byCell.get(`${cellE4(entry.latitude)},${cellE4(entry.longitude)}`)
      return {
        entry,
        likeCount: place?.likeCount ?? 0,
        confirmed: isConfirmed(place?.distinctVisitors ?? 0),
      }
    })
    .sort((a, b) => b.likeCount - a.likeCount || b.entry.mintedAt.localeCompare(a.entry.mintedAt))

  return (
    <View style={styles.section}>
      <AppText type="subtitle">{t('keeper.myPlaces', { count: items.length })}</AppText>
      {items.length === 0 ? (
        <AppText style={styles.empty}>{t('keeper.noPlaces')}</AppText>
      ) : (
        <View style={styles.grid}>
          {items.map(({ entry, likeCount, confirmed }) => (
            <View key={entry.signature} style={[styles.item, confirmed ? styles.itemConfirmed : null]}>
              {entry.thumbUri || entry.photoUri ? (
                <Image source={{ uri: entry.thumbUri ?? entry.photoUri }} style={styles.photo} contentFit="cover" />
              ) : (
                <View style={[styles.photo, styles.photoFallback]} />
              )}
              {/* Lieu confirmé (#44) : même coche ambre que le badge des fiches. */}
              {confirmed ? (
                <View style={styles.confirmed} accessibilityLabel={t('place.confirmed')}>
                  <PixelGlyph name="check" color={Palette.cream} cell={3} />
                </View>
              ) : null}
              {likeCount > 0 ? (
                <View style={styles.count}>
                  <PixelGlyph name="heart" color={Palette.teal} cell={2} />
                  <AppText style={styles.countText}>{likeCount}</AppText>
                </View>
              ) : null}
            </View>
          ))}
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  section: {
    gap: 8,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  item: {
    // Trois colonnes avec le gap de 8 : (100% - 16) / 3.
    width: '31.5%',
    aspectRatio: 1,
    borderWidth: 2,
    borderColor: Palette.plum,
  },
  // Bordure ambre épaisse : la coche seule, 20 px sur une photo pixelisée
  // chargée, passait inaperçue (retour du 29/09/2026).
  itemConfirmed: {
    borderWidth: 4,
    borderColor: Palette.amber,
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  photoFallback: {
    backgroundColor: Palette.sand,
  },
  count: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: Palette.ink,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  confirmed: {
    position: 'absolute',
    top: 0,
    left: 0,
    backgroundColor: Palette.amber,
    borderWidth: 2,
    borderColor: Palette.plum,
    padding: 3,
  },
  countText: {
    fontSize: 11,
    color: Palette.teal,
  },
  empty: {
    color: Palette.terracotta,
  },
})
