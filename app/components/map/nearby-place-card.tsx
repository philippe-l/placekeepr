import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { Linking, ScrollView, StyleSheet, View } from 'react-native'
import { AppText } from '@/components/app-text'
import { useCluster } from '@/components/cluster/cluster-provider'
import { reputationScore } from '@/components/keeper/ranks'
import { NearbyPlace } from '@/components/map/use-nearby-places'
import { usePlaceLike } from '@/components/map/use-place-like'
import { PlaceConfirmationBadge } from '@/components/place/place-confirmation-badge'
import { displayNameOf } from '@/components/profile/display-name'
import { useProfiles } from '@/components/profile/use-profiles'
import { PixelButton } from '@/components/ui/pixel-button'
import { PixelCard } from '@/components/ui/pixel-card'
import { PixelFont } from '@/components/app-theme'
import { Palette } from '@/constants/colors'
import { ellipsify } from '@/utils/ellipsify'
import { placePhotoUrl } from '@/utils/backend'

/**
 * Mini fiche d'un lieu tenu par un autre gardien (marqueur teal) : données du
 * miroir (nearby_places), miniature servie par le backend. Pas de suppression
 * ici — le lieu ne nous appartient pas.
 *
 * Le like se fait depuis cette carte (geste à distance, sans condition). La
 * visite non : elle exige un fix GPS, porte un cooldown de 24 h et un motif de
 * refus à expliquer — elle vit sur la fiche plein écran, où il y a la place
 * pour le dire.
 */
export function NearbyPlaceCard({ place, onClose }: { place: NearbyPlace; onClose: () => void }) {
  const { t } = useTranslation()
  const router = useRouter()
  const { getExplorerUrl } = useCluster()
  const thumbUrl = placePhotoUrl(place.thumbPath ?? place.photoPath)
  const like = usePlaceLike(place)
  const profiles = useProfiles([place.minter])
  // Bouton visible seulement si le lieu est au registre on-chain (les legacy
  // ne se likent pas), wallet connecté, et pas le gardien lui-même.
  const canLike = like.data?.registered && like.wallet !== null && !like.data.keeper?.equals(like.wallet)

  // La fiche vit dans un overlay en `absoluteFill` : sans hauteur bornée, une
  // photo + trois métas + quatre boutons la faisaient déborder par le bas et
  // FERMER passait hors écran — fiche impossible à refermer (vu le 16/09/2026).
  // Le bloc d'infos scrolle, les actions restent posées dessous.
  return (
    <PixelCard accent="teal" style={styles.card} contentStyle={styles.face}>
      <View style={styles.titleRow}>
        {/* Lat/lng empilés : laisse la place au badge sur écran étroit. */}
        <View style={styles.coords}>
          <AppText type="subtitle">{place.latitude.toFixed(4)}</AppText>
          <AppText type="subtitle">{place.longitude.toFixed(4)}</AppText>
        </View>
        <View style={styles.badge}>
          <AppText style={styles.badgeText}>{t('place.otherKeeper')}</AppText>
        </View>
      </View>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {thumbUrl ? <Image source={{ uri: thumbUrl }} style={styles.photo} contentFit="cover" /> : null}
        <AppText style={styles.meta}>
          {t('place.keeper', { address: displayNameOf(place.minter, profiles.data?.[place.minter]) })}
        </AppText>
        <AppText style={styles.meta}>
          {t('place.minted', { date: place.mintedAt.slice(0, 10), tx: ellipsify(place.signature, 6) })}
        </AppText>
        {like.data?.registered ? (
          <AppText style={styles.likes}>
            {t('place.likesOnPlace', { count: place.likeCount })}
            {place.visitCount > 0 ? ' · ' + t('place.visitsOnPlace', { count: place.visitCount }) : ''}
            {/* Amber = réputation, la seule chose qu'il colore (handoff design). */}
            <AppText style={styles.reputation}>
              {' · ' + t('place.reputation', { count: reputationScore(like.data.keeperStats) })}
            </AppText>
          </AppText>
        ) : null}
        {/* Les lieux legacy (hors registre) ne se visitent pas : pas de jauge. */}
        {like.data?.registered ? <PlaceConfirmationBadge distinctVisitors={place.distinctVisitors} /> : null}
        {like.data && !like.data.registered ? (
          <AppText style={styles.meta}>{t('place.likeUnavailableLegacy')}</AppText>
        ) : null}
        {like.toggle.isError ? <AppText style={styles.likeError}>{t('place.likeFailed')}</AppText> : null}
        <PixelButton
          title={t('place.explorer')}
          variant="secondary"
          onPress={() => Linking.openURL(getExplorerUrl(`tx/${place.signature}`))}
        />
      </ScrollView>
      {canLike ? (
        <PixelButton
          title={like.data?.liked ? t('place.unlike') : t('place.like')}
          variant={like.data?.liked ? 'secondary' : 'like'}
          disabled={like.toggle.isPending}
          onPress={() => like.toggle.mutate()}
        />
      ) : null}
      <PixelButton
        title={t('place.details')}
        onPress={() =>
          router.push({
            pathname: '/place/[signature]',
            params: {
              signature: place.signature,
              lat: String(place.latitude),
              lng: String(place.longitude),
              minter: place.minter,
              mintedAt: place.mintedAt,
              thumbPath: place.thumbPath ?? place.photoPath ?? undefined,
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
    backgroundColor: Palette.teal,
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
  likes: {
    color: Palette.teal,
    fontSize: 13,
  },
  reputation: {
    color: Palette.amber,
    fontSize: 13,
  },
  likeError: {
    color: Palette.raspberry,
    fontSize: 13,
  },
})
