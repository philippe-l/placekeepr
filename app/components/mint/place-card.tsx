import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { Alert, Linking, ScrollView, StyleSheet, View } from 'react-native'
import { showToast } from '@/components/ui/pixel-toast'
import { AppText } from '@/components/app-text'
import { useCluster } from '@/components/cluster/cluster-provider'
import { forgetPlace } from '@/components/mint/forget-place'
import { MintLogEntry } from '@/components/mint/mint-log'
import { useInvalidateMintLog } from '@/components/mint/use-mint-log'
import { PixelButton } from '@/components/ui/pixel-button'
import { PixelCard } from '@/components/ui/pixel-card'
import { PixelFont } from '@/components/app-theme'
import { Palette } from '@/constants/colors'
import { ellipsify } from '@/utils/ellipsify'

/**
 * Mini fiche d'un lieu capturé (tap sur un marqueur de la carte).
 * Version locale : photo + coordonnées + lien explorer. La fiche complète
 * (gardien, likes, visites — cf. docs/design/placekeepr-mockups.html)
 * viendra avec le backend en Phase 3.
 */
export function PlaceCard({ entry, onClose }: { entry: MintLogEntry; onClose: () => void }) {
  const { t } = useTranslation()
  const router = useRouter()
  const { getExplorerUrl } = useCluster()
  const invalidateMintLog = useInvalidateMintLog()

  const onRemove = () => {
    Alert.alert(t('place.removeConfirmTitle'), t('place.removeConfirmMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('place.remove'),
        style: 'destructive',
        onPress: async () => {
          await forgetPlace(entry.signature)
          invalidateMintLog()
          onClose()
          showToast({ text: t('place.removed'), tone: 'info', duration: 'short' })
        },
      },
    ])
  }

  // Même contrainte que la fiche « autre gardien » : overlay en `absoluteFill`,
  // donc hauteur bornée et bloc d'infos scrollable — sinon FERMER sort de
  // l'écran et le marqueur reste collé (vu le 16/09/2026).
  return (
    <PixelCard accent="coral" style={styles.card} contentStyle={styles.face}>
      <View style={styles.titleRow}>
        {/* Lat/lng empilés : laisse la place au badge sur écran étroit. */}
        <View style={styles.coords}>
          <AppText type="subtitle">{entry.latitude.toFixed(4)}</AppText>
          <AppText type="subtitle">{entry.longitude.toFixed(4)}</AppText>
        </View>
        <View style={styles.badge}>
          <AppText style={styles.badgeText}>{t('place.kept')}</AppText>
        </View>
      </View>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* Miniature pixel-art in-app ; l'originale (photoUri) reste la preuve. */}
        {entry.thumbUri || entry.photoUri ? (
          <Image source={{ uri: entry.thumbUri ?? entry.photoUri }} style={styles.photo} contentFit="cover" />
        ) : null}
        <AppText style={styles.meta}>
          {t('place.minted', { date: entry.mintedAt.slice(0, 10), tx: ellipsify(entry.signature, 6) })}
        </AppText>
        <PixelButton
          title={t('place.explorer')}
          variant="secondary"
          onPress={() => Linking.openURL(getExplorerUrl(`tx/${entry.signature}`))}
        />
        <PixelButton title={t('place.remove')} variant="danger" onPress={onRemove} />
      </ScrollView>
      <PixelButton
        title={t('place.details')}
        onPress={() =>
          router.push({
            pathname: '/place/[signature]',
            params: {
              signature: entry.signature,
              lat: String(entry.latitude),
              lng: String(entry.longitude),
              mintedAt: entry.mintedAt,
            },
          })
        }
      />
      <PixelButton title={t('common.close')} variant="secondary" onPress={onClose} />
    </PixelCard>
  )
}

const styles = StyleSheet.create({
  card: {
    alignSelf: 'stretch',
    marginBottom: 8,
    // flexShrink vaut 0 par défaut en RN : sans ça, la fiche garde sa hauteur
    // de contenu et sort du cadre au lieu de se réduire à la place disponible.
    flexShrink: 1,
  },
  face: {
    flexShrink: 1,
  },
  scroll: {
    flexShrink: 1,
  },
  scrollContent: {
    gap: 8,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  coords: {
    flex: 1,
    gap: 2,
  },
  badge: {
    flexShrink: 0,
    backgroundColor: Palette.amber,
    borderWidth: 2,
    borderColor: Palette.plum,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  badgeText: {
    fontFamily: PixelFont,
    fontSize: 8,
    color: Palette.cream,
  },
  photo: {
    width: '100%',
    aspectRatio: 4 / 3,
  },
  meta: {
    color: Palette.terracotta,
    fontSize: 13,
  },
})
