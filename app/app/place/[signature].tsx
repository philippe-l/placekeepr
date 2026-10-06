import { Image } from 'expo-image'
import { useLocalSearchParams, useRouter } from 'expo-router'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { Linking, ScrollView, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useMobileWallet } from '@wallet-ui/react-native-web3js'
import { AppText } from '@/components/app-text'
import { PixelFont } from '@/components/app-theme'
import { AppView } from '@/components/app-view'
import { useCluster } from '@/components/cluster/cluster-provider'
import { reputationScore } from '@/components/keeper/ranks'
import { usePlaceLike } from '@/components/map/use-place-like'
import { entriesForWallet } from '@/components/mint/mint-log'
import { useMintLog } from '@/components/mint/use-mint-log'
import { KeeperCard } from '@/components/place/keeper-card'
import { PlaceConfirmationBadge } from '@/components/place/place-confirmation-badge'
import { usePlaceDistinctVisitors } from '@/components/place/use-place-distinct-visitors'
import { usePlaceLikeCount } from '@/components/place/use-place-like-count'
import { usePlaceVisit } from '@/components/place/use-place-visit'
import { usePlaceVisitCount } from '@/components/place/use-place-visit-count'
import { VisitRejected } from '@/components/place/verify-visit'
import { PixelButton } from '@/components/ui/pixel-button'
import { PixelGlyph } from '@/components/ui/pixel-glyph'
import { Palette } from '@/constants/colors'
import { ellipsify } from '@/utils/ellipsify'
import { placePhotoUrl } from '@/utils/backend'
import { toPublicKey } from '@/utils/to-public-key'

/**
 * Fiche lieu plein écran (handoff design 4.2) :
 *  - 3a MON LIEU (accent corail) — fierté + gestion : likes et passages reçus
 *    deviennent de la réputation ;
 *  - 3b LIEU D'UN AUTRE (accent teal) — le gardien est la vedette, les deux
 *    CTA nourrissent sa réputation : AIMER à distance, PROUVER MA VISITE sur
 *    place (présence GPS co-signée, un passage par 24 h).
 * Ouverte depuis les fiches en feuille de la carte. Params : coordonnées et
 * méta du lieu (le journal local prime pour la photo si c'est le mien).
 */

/** Heures restantes avant la fin du cooldown, arrondies au supérieur. */
function hoursUntil(timestamp: number): number {
  return Math.ceil((timestamp - Date.now()) / 3_600_000)
}

export default function PlaceSheetScreen() {
  const params = useLocalSearchParams<{
    signature: string
    lat: string
    lng: string
    minter?: string
    mintedAt?: string
    thumbPath?: string
  }>()
  const { t } = useTranslation()
  const router = useRouter()
  const { getExplorerUrl } = useCluster()
  const { account } = useMobileWallet()
  const mintLog = useMintLog()

  const latitude = Number(params.lat)
  const longitude = Number(params.lng)
  const wallet = account ? toPublicKey(account.publicKey).toBase58() : null

  // Mon lieu = une entrée du journal minée par le wallet connecté.
  const entry = entriesForWallet(mintLog.data ?? [], wallet).find(
    (candidate) => candidate.signature === params.signature,
  )
  const mine = entry !== undefined

  const placeRef = { latitude, longitude, signature: params.signature }
  const like = usePlaceLike(placeRef)
  const likeCount = usePlaceLikeCount(latitude, longitude)
  const visit = usePlaceVisit(placeRef, like.data?.keeper ?? null)
  const visitCount = usePlaceVisitCount(latitude, longitude)
  const distinctVisitors = usePlaceDistinctVisitors(latitude, longitude)

  const photoUri = entry?.thumbUri ?? entry?.photoUri ?? placePhotoUrl(params.thumbPath ?? null)
  const mintedAt = (entry?.mintedAt ?? params.mintedAt ?? '').slice(0, 10)
  const keeperAddress = like.data?.keeper?.toBase58() ?? params.minter ?? entry?.minter ?? ''
  const count = likeCount.data ?? 0
  const visits = visitCount.data ?? 0
  // Contribution de CE lieu à la réputation de son gardien, au même barème
  // que le profil (une visite vaut deux likes).
  const contribution = reputationScore({ likesReceived: count, visitsReceived: visits })
  // Les deux gestes ont la même porte d'entrée : lieu au registre, wallet
  // connecté, et ce wallet n'est pas le gardien (le programme refuse
  // l'auto-like comme l'auto-visite).
  const canEngage =
    !mine && like.data?.registered === true && like.wallet !== null && !like.data.keeper?.equals(like.wallet)
  const myVisits = visit.data?.count ?? 0

  const visitError = visit.visit.error
  const visitErrorText =
    visitError instanceof VisitRejected
      ? t(`place.visitRejected.${visitError.reason}`, { distance: visitError.distanceM ?? '?' })
      : visitError
        ? t('place.visitFailed')
        : null

  const visitLabel = visit.visit.isPending
    ? t('place.visiting')
    : visit.onCooldown && visit.cooldownUntil !== null
      ? hoursUntil(visit.cooldownUntil) > 1
        ? t('place.visitCooldown', { hours: hoursUntil(visit.cooldownUntil) })
        : t('place.visitCooldownSoon')
      : myVisits > 0
        ? t('place.visitAgain')
        : t('place.proveVisit')

  return (
    <AppView style={styles.page}>
      <SafeAreaView style={styles.page}>
        <ScrollView contentContainerStyle={styles.content}>
          {/* Héros : la photo, bordée à la couleur du camp. */}
          <View style={[styles.heroWrap, { borderColor: mine ? Palette.coral : Palette.teal }]}>
            {photoUri ? (
              <Image source={{ uri: photoUri }} style={styles.hero} contentFit="cover" />
            ) : (
              <View style={[styles.hero, styles.heroFallback]} />
            )}
            <View style={[styles.heroBadge, { backgroundColor: mine ? Palette.coral : Palette.teal }]}>
              <AppText style={styles.heroBadgeText}>{mine ? t('place.yourPlace') : t('place.otherKeeper')}</AppText>
            </View>
          </View>

          <View>
            <AppText type="title">{latitude.toFixed(4)}</AppText>
            <AppText type="title">{longitude.toFixed(4)}</AppText>
          </View>
          {mintedAt ? (
            <AppText style={styles.meta}>
              {t('place.minted', { date: mintedAt, tx: ellipsify(params.signature, 6) })}
            </AppText>
          ) : null}
          {like.data?.registered && distinctVisitors.data !== undefined ? (
            <PlaceConfirmationBadge distinctVisitors={distinctVisitors.data} />
          ) : null}

          {mine ? (
            // 3a — fierté + gestion : likes et passages deviennent de la réputation.
            <View style={styles.statsRow}>
              <View style={[styles.stat, { borderColor: Palette.teal }]}>
                <PixelGlyph name="heart" color={Palette.teal} cell={3} />
                <AppText style={[styles.statNumber, { color: Palette.teal }]}>{count}</AppText>
                <AppText style={styles.statLabel}>{t('place.statLikes')}</AppText>
              </View>
              <View style={[styles.stat, { borderColor: Palette.teal }]}>
                <PixelGlyph name="footprint" color={Palette.teal} cell={3} />
                <AppText style={[styles.statNumber, { color: Palette.teal }]}>{visits}</AppText>
                <AppText style={styles.statLabel}>{t('place.statVisits')}</AppText>
              </View>
              <View style={[styles.stat, { borderColor: Palette.amber }]}>
                <PixelGlyph name="star" color={Palette.amber} cell={3} />
                <AppText style={[styles.statNumber, { color: Palette.amber }]}>+{contribution}</AppText>
                <AppText style={styles.statLabel}>{t('place.statReputation')}</AppText>
              </View>
            </View>
          ) : (
            <>
              {like.data?.registered && keeperAddress ? (
                <KeeperCard address={keeperAddress} stats={like.data.keeperStats} />
              ) : null}
              {canEngage ? (
                <>
                  <View style={styles.likeBlock}>
                    <PixelButton
                      title={like.data?.liked ? t('place.unlike') : t('place.like')}
                      variant={like.data?.liked ? 'secondary' : 'like'}
                      disabled={like.toggle.isPending}
                      onPress={() => like.toggle.mutate()}
                    />
                    <AppText style={styles.likeHint}>{t('place.likeHint', { count })}</AppText>
                    {like.toggle.isError ? <AppText style={styles.likeError}>{t('place.likeFailed')}</AppText> : null}
                  </View>

                  {/* Présence physique : co-signée par le vérifieur, 1 par 24 h. */}
                  <View style={styles.likeBlock}>
                    <PixelButton
                      title={visitLabel}
                      variant="reputation"
                      disabled={visit.visit.isPending || visit.onCooldown}
                      onPress={() => visit.visit.mutate()}
                    />
                    <AppText style={styles.likeHint}>
                      {myVisits > 0 ? t('place.visitHintDone', { count: myVisits }) : t('place.visitHint')}
                    </AppText>
                    {visitErrorText ? <AppText style={styles.likeError}>{visitErrorText}</AppText> : null}
                  </View>
                </>
              ) : null}
              {like.data && !like.data.registered ? (
                <>
                  <AppText style={styles.meta}>{t('place.likeUnavailableLegacy')}</AppText>
                  <AppText style={styles.meta}>{t('place.visitUnavailableLegacy')}</AppText>
                </>
              ) : null}
              {visits > 0 ? <AppText style={styles.meta}>{t('place.visitsOnPlace', { count: visits })}</AppText> : null}
            </>
          )}

          <PixelButton
            title={t('place.explorer')}
            variant="secondary"
            onPress={() => Linking.openURL(getExplorerUrl(`tx/${params.signature}`))}
          />
          <PixelButton title={t('common.close')} variant="secondary" onPress={() => router.back()} />
        </ScrollView>
      </SafeAreaView>
    </AppView>
  )
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
  },
  content: {
    padding: 16,
    gap: 14,
  },
  heroWrap: {
    borderWidth: 3,
  },
  hero: {
    width: '100%',
    aspectRatio: 4 / 3,
  },
  heroFallback: {
    backgroundColor: Palette.sand,
  },
  heroBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    borderWidth: 2,
    borderColor: Palette.plum,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  heroBadgeText: {
    fontFamily: PixelFont,
    fontSize: 8,
    color: Palette.cream,
  },
  meta: {
    color: Palette.terracotta,
    fontSize: 13,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    borderWidth: 2,
    backgroundColor: Palette.sand,
    paddingVertical: 12,
  },
  statNumber: {
    fontFamily: PixelFont,
    fontSize: 16,
    lineHeight: 22,
  },
  statLabel: {
    fontSize: 11,
    color: Palette.terracotta,
    textAlign: 'center',
  },
  likeBlock: {
    gap: 6,
  },
  likeHint: {
    fontSize: 12,
    color: Palette.terracotta,
    textAlign: 'center',
  },
  likeError: {
    color: Palette.raspberry,
    fontSize: 13,
    textAlign: 'center',
  },
})
